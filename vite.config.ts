import { fileURLToPath, URL } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { gzipSync, brotliCompressSync, constants as zlibConstants } from "node:zlib";
import { createMastodonAuthMiddleware } from "./server/mastodon-auth-middleware";

// zstdCompressSync is natively available in Node.js >= 22.15.
// Access via bracket notation to avoid TS errors on older @types/node.
type ZstdOpts = { params?: Record<number, number> };
type ZlibPlusZstd = {
  zstdCompressSync?: (buf: Buffer, opts?: ZstdOpts) => Buffer;
};
const { zstdCompressSync } = (await import("node:zlib")) as ZlibPlusZstd;

// Files worth pre-compressing. Binary formats (images, wasm, fonts with
// pre-compressed glyph tables) are excluded — compressing them yields
// negligible savings or actually inflates the output.
const COMPRESSIBLE = /\.(js|cjs|mjs|css|html|json|svg|woff2?)$/;
const MIN_COMPRESS_BYTES = 1024;

function normalizedModuleId(id: string): string {
  return id.split("\\").join("/");
}

// Emit .gz, .br, and (when native Node.js Zstd is available) .zst alongside
// every compressible build artifact. Static file servers (nginx, Caddy, etc.)
// can serve the pre-compressed variant, eliminating per-request CPU cost.
//
// Encoding priority a client should advertise and a server should prefer:
//   1. zstd  — best ratio + speed; Chrome 118+, Firefox 126+
//   2. br    — excellent ratio; all modern browsers
//   3. gzip  — universal fallback
function preCompressionPlugin(): Plugin {
  return {
    name: "ryu-pre-compress",
    apply: "build",
    generateBundle(_options, bundle) {
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (!COMPRESSIBLE.test(fileName)) continue;

        let buf: Buffer;
        if (chunk.type === "chunk") {
          buf = Buffer.from(chunk.code, "utf8");
        } else if (chunk.type === "asset") {
          buf =
            typeof chunk.source === "string"
              ? Buffer.from(chunk.source, "utf8")
              : Buffer.from(chunk.source as Uint8Array);
        } else {
          continue;
        }

        if (buf.length < MIN_COMPRESS_BYTES) continue;

        // gzip — level 9: maximum ratio; build is offline so speed is secondary.
        this.emitFile({
          type: "asset",
          fileName: `${fileName}.gz`,
          source: gzipSync(buf, { level: 9 })
        });

        // brotli — quality 11: slowest but best ratio for static pre-compression.
        this.emitFile({
          type: "asset",
          fileName: `${fileName}.br`,
          source: brotliCompressSync(buf, {
            params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 }
          })
        });

        // zstd level 19 — available natively in Node.js >= 22.15; skipped silently on older runtimes.
        // Level 19 maximises ratio for offline pre-compression (speed is irrelevant at build time).
        // ZSTD_c_compressionLevel param key is 100 (literal used here because older @types/node
        // versions do not include zstd constants in the constants object type).
        if (zstdCompressSync) {
          this.emitFile({
            type: "asset",
            fileName: `${fileName}.zst`,
            source: zstdCompressSync(buf, { params: { 100: 19 } })
          });
        }
      }
    }
  };
}

export default defineConfig({
  plugins: [
    react(),
    preCompressionPlugin(),
    {
      name: "ryu-mastodon-auth-backend",
      configureServer(server) {
        server.middlewares.use(createMastodonAuthMiddleware());
      }
    }
  ],
  resolve: {
    conditions: ["onnxruntime-web-use-extern-wasm"],
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp"
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const moduleId = normalizedModuleId(id);

          if (moduleId.includes("node_modules/react") || moduleId.includes("node_modules/react-dom") || moduleId.includes("node_modules/scheduler")) {
            return "react-vendor";
          }

          if (moduleId.includes("node_modules/@tanstack/react-query")) {
            return "query-vendor";
          }

          if (
            moduleId.includes("node_modules/dompurify") ||
            moduleId.includes("node_modules/markdown-it") ||
            moduleId.includes("node_modules/mfm-js") ||
            moduleId.includes("node_modules/twemoji") ||
            moduleId.includes("node_modules/entities") ||
            moduleId.includes("node_modules/linkify-it") ||
            moduleId.includes("node_modules/mdurl") ||
            moduleId.includes("node_modules/uc.micro")
          ) {
            return "rich-text-vendor";
          }

          if (moduleId.includes("node_modules/onnxruntime-web") || moduleId.includes("node_modules/onnxruntime-common")) {
            return "ml-onnxruntime";
          }

          if (moduleId.includes("node_modules/@huggingface/jinja")) {
            return "ml-jinja";
          }

          if (moduleId.includes("node_modules/@huggingface/transformers")) {
            return "ml-transformers";
          }

          if (moduleId.includes("node_modules/rxdb") || moduleId.includes("node_modules/dexie")) {
            return "db-runtime";
          }

          if (moduleId.includes("node_modules/framer-motion") || moduleId.includes("node_modules/lucide-react")) {
            return "ui-vendor";
          }

          if (moduleId.includes("/src/app/") || moduleId.includes("/src/components/")) {
            return "app-ui";
          }

          if (
            moduleId.includes("/src/auth/") ||
            moduleId.includes("/src/db/") ||
            moduleId.includes("/src/hooks/") ||
            moduleId.includes("/src/lib/") ||
            moduleId.includes("/src/search/") ||
            moduleId.includes("/src/sync/")
          ) {
            return "app-runtime";
          }
        }
      }
    }
  }
});
