import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createMastodonAuthMiddleware } from "./server/mastodon-auth-middleware";

export default defineConfig({
  plugins: [
    react(),
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
