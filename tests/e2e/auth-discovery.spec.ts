import { expect, test } from "@playwright/test";

const FEDIDB_URL = "https://api.fedidb.org/v1/servers";
const BOOKWYRM_SOURCE_URL = "https://joinbookwyrm.com/instances/";
const OLIPHANT_URL = "https://codeberg.org/oliphant/blocklists/raw/branch/main/blocklists/_unified_tier0_blocklist.csv";

test.beforeEach(async ({ page }) => {
  await page.route(`${FEDIDB_URL}**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          {
            domain: "bookwyrm.social",
            open_registration: true,
            description: "Books and federated reading",
            location: { city: "Berlin", country: "DE" },
            software: { name: "BookWyrm", slug: "bookwyrm" },
            stats: { user_count: 42000 }
          },
          {
            domain: "blocked.example",
            open_registration: true,
            description: "Should be filtered by tier0",
            location: { city: "Paris", country: "FR" },
            software: { name: "Mastodon", slug: "mastodon" },
            stats: { user_count: 1400 }
          }
        ],
        links: { next: null }
      })
    });
  });

  await page.route(BOOKWYRM_SOURCE_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<html><body>
        <a href="https://bookwyrm.social">Join instance: bookwyrm.social</a>
        <a href="https://blocked.example">Join instance: blocked.example</a>
      </body></html>`
    });
  });

  await page.route(OLIPHANT_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/csv",
      body: "domain,reason\nblocked.example,abuse"
    });
  });
});

test("instance picker filters blocked domains and populates selected instance", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("tab", { name: "Profile" }).click();
  await page.getByRole("button", { name: "Browse" }).click();

  const dialog = page.getByRole("dialog", { name: "Instance picker" });
  await expect(dialog).toBeVisible();

  await expect(dialog.getByRole("button", { name: /bookwyrm.social/i })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /blocked.example/i })).toHaveCount(0);

  await dialog.getByRole("button", { name: /bookwyrm.social/i }).click();
  await expect(dialog).toHaveCount(0);

  await expect(page.getByLabel("BookWyrm or Mastodon instance")).toHaveValue("bookwyrm.social");
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
  await page.getByRole("tab", { name: "Profile" }).click();

  await expect(page.getByText(/Account connected as reader@bookwyrm.social/i)).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(() => sessionStorage.getItem("ryu.mastodon.pending_auth"))
    )
    .toBeNull();

  expect(exchangeAttempts).toBe(3);
});
