import { expect, test } from "@playwright/test";

const INSTANCE_DISCOVERY_URL = "**/api/discovery/instances**";

test.beforeEach(async ({ page }) => {
  await page.route(INSTANCE_DISCOVERY_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        instances: [
          {
            domain: "bookwyrm.social",
            url: "https://bookwyrm.social",
            softwareName: "BookWyrm",
            softwareSlug: "bookwyrm",
            country: "DE",
            city: "Berlin",
            userCount: 42000,
            openRegistration: true,
            localApprovalRequired: false,
            registrationType: "open"
          }
        ],
        generatedAt: new Date().toISOString(),
        source: "test"
      })
    });
  });
});

test("instance picker filters blocked domains and populates selected instance", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("tab", { name: "Account" }).click();
  await page.getByRole("button", { name: "Browse servers" }).click();

  const dialog = page.getByRole("dialog", { name: "Instance picker" });
  await expect(dialog).toBeVisible();

  const bookwyrmCard = dialog.locator("article").filter({ hasText: "bookwyrm.social" });
  await expect(bookwyrmCard).toBeVisible();
  await expect(dialog.getByText("blocked.example")).toHaveCount(0);

  await bookwyrmCard.getByRole("button", { name: "Use this server" }).click();
  await expect(dialog).toHaveCount(0);

  await expect(page.getByLabel("BookWyrm or Mastodon instance")).toHaveValue("bookwyrm.social");
  await expect(page.getByRole("button", { name: "Continue with this server" })).toBeVisible();
});

test("oauth callback retries transient exchange failures and self-heals", async ({ page }) => {
  let exchangeAttempts = 0;

  await page.route("**/api/auth/mastodon/exchange", async (route) => {
    exchangeAttempts += 1;

    if (exchangeAttempts < 3) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "temporary_unavailable" })
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        connected: true,
        instanceOrigin: "https://bookwyrm.social",
        tokenType: "Bearer",
        scope: "read profile",
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        account: {
          id: "123",
          username: "reader",
          acct: "reader@bookwyrm.social",
          url: "https://bookwyrm.social/@reader"
        }
      })
    });
  });

  await page.addInitScript(() => {
    sessionStorage.setItem(
      "ryu.mastodon.pending_auth",
      JSON.stringify({
        instanceOrigin: "https://bookwyrm.social",
        state: "test-state-1",
        codeVerifier: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~ab",
        requestedScopes: ["read", "profile"],
        redirectUri: "http://localhost:4173/",
        createdAt: Date.now()
      })
    );
  });

  await page.goto("/?code=abc123&state=test-state-1");
  await page.getByRole("tab", { name: "Account" }).click();

  await expect(page.getByText(/Account connected as reader@bookwyrm.social/i)).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(() => sessionStorage.getItem("ryu.mastodon.pending_auth"))
    )
    .toBeNull();

  expect(exchangeAttempts).toBe(3);
});
