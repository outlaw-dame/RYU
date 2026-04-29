import { createServer } from "node:http";
import { createMastodonAuthMiddleware } from "./mastodon-auth-middleware";

const DEFAULT_PORT = 8787;

export function startMastodonAuthServer(port = DEFAULT_PORT) {
  const middleware = createMastodonAuthMiddleware();

  const server = createServer((req, res) => {
    middleware(req, res, () => {
      if (!res.writableEnded) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ error: "not_found" }));
      }
    });
  });

  return new Promise<{ port: number; close: () => Promise<void> }>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to bind auth server"));
        return;
      }

      resolve({
        port: address.port,
        close: () =>
          new Promise<void>((resolveClose, rejectClose) => {
            server.close((error) => {
              if (error) { rejectClose(error); return; }
              resolveClose();
            });
          })
      });
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const envPort = Number(process.env.MASTODON_AUTH_PORT ?? "");
  const port = Number.isFinite(envPort) && envPort > 0 ? envPort : DEFAULT_PORT;

  void startMastodonAuthServer(port)
    .then(({ port: boundPort, close }) => {
      console.log(`[ryu:auth] Server listening on http://127.0.0.1:${boundPort}`);

      const shutdown = () => {
        console.log("\n[ryu:auth] Shutting down gracefully...");
        void close()
          .then(() => process.exit(0))
          .catch(() => process.exit(1));
      };

      process.once("SIGTERM", shutdown);
      process.once("SIGINT", shutdown);
    })
    .catch((error: unknown) => {
      console.error("[ryu:auth]", error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
