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
          if (id.includes("node_modules/rxdb") || id.includes("node_modules/dexie")) {
            return "db-runtime";
          }

          if (id.includes("node_modules/framer-motion") || id.includes("node_modules/lucide-react")) {
            return "ui-vendor";
          }
        }
      }
    }
  }
});
