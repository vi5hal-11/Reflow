import { randomUUID } from "node:crypto";
import { test, expect, hasSupabaseAdmin, seedTodayTask } from "./fixtures/auth";

// The signed-in core loop — the thing every prior phase verified only with unit
// tests and route guards, never as a real logged-in user. Needs a Supabase
// service key to seed a confirmed test account; skips itself without one so CI
// stays green on the public smoke suite.
test.describe("signed-in core loop", () => {
  test.skip(!hasSupabaseAdmin, "set SUPABASE_SECRET_KEY (in .env.local) to run signed-in E2E");

  test("capture drops into the inbox and triages to today", async ({ authedPage: page }) => {
    const title = `E2E capture ${randomUUID().slice(0, 8)}`;

    const box = page.getByPlaceholder(/Dump anything/);
    await box.fill(title);
    // Capture the persistence round-trip so we can tell the optimistic temp row
    // apart from the saved one (triage no-ops on unsaved temp ids).
    const insert = page.waitForResponse(
      (r) =>
        r.url().includes("/rest/v1/tasks") &&
        r.request().method() === "POST" &&
        r.ok(),
    );
    await box.press("Enter");

    // The optimistic row is prepended (newest first). Identify it structurally
    // by the Today button it carries — parse enrichment may rewrite the title.
    const firstRow = page
      .locator("main ul li")
      .filter({ has: page.getByRole("button", { name: "Today", exact: true }) })
      .first();
    await expect(firstRow).toContainText(title); // immediate, before enrichment
    await insert; // now persisted

    // Reload so the row is a real saved task (no optimistic temp id) — this also
    // proves the capture survived the round-trip — then triage → today.
    await page.reload();
    const savedRow = page
      .locator("main ul li")
      .filter({ has: page.getByRole("button", { name: "Today", exact: true }) })
      .first();
    await expect(savedRow).toBeVisible();
    await expect(page.getByText(/0 for today/)).toBeVisible();
    await savedRow.getByRole("button", { name: "Today", exact: true }).click();
    await expect(page.getByText(/1 for today/)).toBeVisible();
  });

  test("a today task places onto the timeline; Plan my day degrades gracefully", async ({
    authedPage: page,
    admin,
    testUserId,
  }) => {
    const title = `E2E place ${randomUUID().slice(0, 8)}`;
    await seedTodayTask(admin, testUserId, title);

    await page.goto("/today");
    const trayItem = page
      .locator("aside[aria-label='To place'] li")
      .filter({ hasText: title });
    await expect(trayItem).toBeVisible();

    // Enter placement mode, then drop it into the first offered gap. Full-day
    // working hours (seeded by the fixture) guarantee a gap exists whatever the
    // wall-clock time.
    await trayItem.getByRole("button", { name: "place", exact: true }).click();
    const gap = page.getByText(/^place at /).first();
    await expect(gap).toBeVisible();
    await gap.click();

    // It now lives on the timeline as a placed block.
    const timeline = page.locator("section[aria-label='Timeline']");
    await expect(timeline.getByText(title)).toBeVisible();

    // Plan my day either re-flows or shows the calm fallback — never an error,
    // and the button always settles back to rest (covers scheduler up OR down).
    const planBtn = page
      .locator("header")
      .getByRole("button")
      .filter({ hasText: /Plan my day|re-flowing/ });
    await planBtn.click();
    await expect(planBtn).toHaveText("Plan my day", { timeout: 15_000 });

    // Whatever the planner did, the task is still on the day — manual placement
    // never depends on the network hot path.
    await expect(timeline.getByText(title)).toBeVisible();
  });

  test("Big 3 → complete lands the win banner, and nothing reads as overdue", async ({
    authedPage: page,
    admin,
    testUserId,
  }) => {
    const title = `E2E win ${randomUUID().slice(0, 8)}`;
    await seedTodayTask(admin, testUserId, title);

    await page.goto("/today");
    const trayItem = page
      .locator("aside[aria-label='To place'] li")
      .filter({ hasText: title });
    await expect(trayItem).toBeVisible();

    // Star it into the Big 3.
    await trayItem.getByRole("button", { name: "Add to Big 3" }).click();
    await expect(
      page.locator("section[aria-label='Daily Big 3'] li").filter({ hasText: title }),
    ).toBeVisible();

    // Finish it — the only Big 3 done → the calm win banner sweeps in.
    await trayItem.getByRole("button", { name: "done", exact: true }).click();
    await expect(page.getByText(/That's a win/)).toBeVisible();

    // The no-guilt guarantee (§7): nothing anywhere shouts "overdue".
    await expect(page.getByText(/overdue/i)).toHaveCount(0);
  });

  test("settings exposes the working-hours + energy controls the scheduler reads", async ({
    authedPage: page,
  }) => {
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/settings/); // rendered, not bounced to /login
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Energy$/ })).toBeVisible();
  });
});
