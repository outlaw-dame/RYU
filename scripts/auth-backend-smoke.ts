import { createServer, type IncomingMessage } from "node:http";
import { startMastodonAuthServer } from "../server/start-mastodon-auth-server";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function startMockMastodonServer() {
  const state = {
    clientId: "",
    clientSecret: "",
    token: "mock-access-token"
  };

  const server = createServer(async (req, res) => {
    if (!req.url) {
      res.statusCode = 404;
      res.end();
      return;
    }

    if (req.method === "POST" && req.url === "/api/v1/apps") {
      const raw = await readBody(req);
      const body = JSON.parse(raw) as { scopes?: string };
      state.clientId = `client-${Date.now()}`;
      state.clientSecret = `secret-${Date.now()}`;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({
        client_id: state.clientId,
        client_secret: state.clientSecret,
        scopes: body.scopes ?? "profile"
      }));
      return;
    }

    if (req.method === "POST" && req.url === "/oauth/token") {
      const raw = await readBody(req);
      const params = new URLSearchParams(raw);
      const valid =
        params.get("client_id") === state.clientId &&
        params.get("client_secret") === state.clientSecret &&
        params.get("grant_type") === "authorization_code";

      if (!valid) {
        res.statusCode = 401;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "invalid_client" }));
        return;
      }

      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({
        access_token: state.token,
        token_type: "Bearer",
        scope: "profile",
        expires_in: 3600
      }));
      return;
    }

    if (req.method === "GET" && req.url === "/api/v1/accounts/verify_credentials") {
      const auth = req.headers.authorization ?? "";
      if (auth !== `Bearer ${state.token}`) {
        res.statusCode = 401;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "invalid_token" }));
        return;
      }

      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({
        id: "1",
        username: "smoke",
        acct: "smoke@localhost",
        url: "http://localhost/@smoke"
      }));
      return;
    }

    if (req.method === "POST" && req.url === "/oauth/revoke") {
      res.setHeader("Content-Type", "application/json");
      res.end("{}");
      return;
    }

    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "not_found" }));
  });

  return new Promise<{ origin: string; close: () => Promise<void> }>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to bind mock mastodon"));
        return;
      }

      resolve({
        origin: `http://localhost:${address.port}`,
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

async function run() {
  process.env.MASTODON_CLIENT_STORE_KEY = "smoke-test-secret";

  const mock = await startMockMastodonServer();
  const authServer = await startMastodonAuthServer(0);
  const authBase = `http://localhost:${authServer.port}`;

  try {
    // ── 1. Register app ────────────────────────────────────────────────────────
    const registerRes = await fetch(`${authBase}/api/auth/mastodon/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instanceOrigin: mock.origin,
        redirectUris: ["http://localhost/callback"],
        scopes: ["profile"]
      })
    });

    if (!registerRes.ok) {
      throw new Error(`Register failed: ${registerRes.status} ${await registerRes.text()}`);
    }

    const registered = await registerRes.json() as { clientId?: string };
    if (!registered.clientId) throw new Error("Register response missing clientId");

    // ── 2. Exchange code for token ─────────────────────────────────────────────
    const exchangeRes = await fetch(`${authBase}/api/auth/mastodon/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instanceOrigin: mock.origin,
        code: "code-123",
        codeVerifier: "A".repeat(64),
        redirectUri: "http://localhost/callback"
      })
    });

    if (!exchangeRes.ok) {
      throw new Error(`Exchange failed: ${exchangeRes.status} ${await exchangeRes.text()}`);
    }

    const setCookieHeader = exchangeRes.headers.get("set-cookie") ?? "";
    if (!setCookieHeader.includes("ryu_masto_session=")) {
      throw new Error("Exchange response missing session cookie");
    }

    // Extract the cookie value (name=value portion only).
    const sessionCookie = setCookieHeader.split(";")[0]?.trim() ?? "";

    const exchangePayload = await exchangeRes.json() as { connected?: boolean; account?: { acct: string } };
    if (!exchangePayload.connected) throw new Error("Exchange response missing connected:true");
    if (!exchangePayload.account?.acct) throw new Error("Exchange response missing account.acct");

    // ── 3. Verify session endpoint returns the connected account ───────────────
    const sessionRes = await fetch(`${authBase}/api/auth/mastodon/session`, {
      headers: { Cookie: sessionCookie }
    });

    if (!sessionRes.ok) {
      throw new Error(`Session check failed: ${sessionRes.status} ${await sessionRes.text()}`);
    }

    const session = await sessionRes.json() as { connected?: boolean; account?: { acct: string } };
    if (!session.connected) throw new Error("Session check returned connected:false");
    if (session.account?.acct !== "smoke@localhost") {
      throw new Error(`Session account mismatch: ${session.account?.acct}`);
    }

    // ── 4. Revoke token ────────────────────────────────────────────────────────
    const revokeRes = await fetch(`${authBase}/api/auth/mastodon/revoke`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: sessionCookie
      },
      body: "{}"
    });

    if (!revokeRes.ok) {
      throw new Error(`Revoke failed: ${revokeRes.status} ${await revokeRes.text()}`);
    }

    // ── 5. Confirm session is absent when no cookie is sent ────────────────────
    // After revoke the browser drops the cookie (Max-Age=0). Simulate that by
    // sending no Cookie header — the session endpoint must return connected:false.
    const postRevokeSessionRes = await fetch(`${authBase}/api/auth/mastodon/session`);

    const postRevokeSession = await postRevokeSessionRes.json() as { connected?: boolean };
    if (postRevokeSession.connected) {
      throw new Error("Session reported as active without a cookie");
    }

    console.log("Auth backend smoke passed");
  } finally {
    await Promise.all([mock.close(), authServer.close()]);
  }
}

void run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
