import { expect, test } from "@playwright/test";

// Public-route smoke + graceful degradation. No auth required, so this is the
// CI-safe slice. Guards the "Warm Paper, One Flow" first impression and the
// promise that the app never hard-fails at the door.

test("landing renders the identity and a way in", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Reflow/);
  await expect(page.getByRole("heading", { name: /heals itself/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /start the day/i }).first()).toBeVisible();
});

test("sign-in page is reachable and calm", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
  await expect(page.getByPlaceholder("you@example.com")).toBeVisible();
});

test("protected routes redirect unauthenticated visitors to login", async ({ page }) => {
  for (const route of ["/today", "/inbox", "/settings"]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/login/);
  }
});

test("the manifest advertises install + share_target", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBeTruthy();
  const manifest = await res.json();
  expect(manifest.share_target).toBeTruthy();
  expect(manifest.icons.length).toBeGreaterThanOrEqual(3);
});

test("no horizontal scroll on a phone viewport", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
