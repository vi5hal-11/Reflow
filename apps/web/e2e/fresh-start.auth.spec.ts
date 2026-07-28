import { randomUUID } from "node:crypto";
import { test, expect, hasSupabaseAdmin, seedTodayTask } from "./fixtures/auth";

// Coming back after a stretch away. The promise: nothing is deleted, and the
// momentum strip is never reset.
test.describe("fresh start", () => {
  test.skip(!hasSupabaseAdmin, "set SUPABASE_SECRET_KEY (in .env.local) to run signed-in E2E");

  test("sets the backlog down to Later, and puts it back", async ({
    authedPage: page,
    admin,
    testUserId,
  }) => {
    const titles = Array.from(
      { length: 3 },
      (_, i) => `E2E backlog ${i} ${randomUUID().slice(0, 5)}`,
    );
    for (const t of titles) await seedTodayTask(admin, testUserId, t);

    await page.goto("/settings");
    const section = page.locator("section").filter({ hasText: "Fresh start" }).first();
    await expect(section).toContainText(/3 things waiting/);

    await section.getByRole("button", { name: "Set them down" }).click();
    await expect(section).toContainText(/Nothing waiting/);

    // Undo puts them straight back (offered in place, while it's still fresh).
    await section.getByRole("button", { name: "Undo" }).click();
    await expect(section).toContainText(/3 things waiting/);

    // Set down again — and confirm they were moved to Later, not destroyed.
    await section.getByRole("button", { name: "Set them down" }).click();
    await expect(section).toContainText(/Nothing waiting/);
    await page.goto("/inbox");
    await expect(page.getByText(/3 for later/)).toBeVisible();
  });

  test("habit grids can start from today without losing history", async ({
    authedPage: page,
    admin,
    testUserId,
  }) => {
    const title = `E2E habit ${randomUUID().slice(0, 5)}`;
    const { data: habit } = await admin
      .from("habits")
      .insert({ user_id: testUserId, title, icon: "sparkles", color: "sage", position: 0 })
      .select("id")
      .single();

    // A check-in from a week ago — the history that must survive.
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const logDate = weekAgo.toISOString().slice(0, 10);
    await admin
      .from("habit_logs")
      .insert({ user_id: testUserId, habit_id: habit!.id, log_date: logDate });

    await page.goto("/habits");
    await expect(page.getByText(title)).toBeVisible();
    await expect(page.getByText(/of 14 days/).first()).toBeVisible();

    await page.goto("/settings");
    const section = page.locator("section").filter({ hasText: "Fresh start" }).first();
    await section.getByRole("button", { name: "Start fresh" }).click();

    // The grid now counts a shorter window — and the old log still exists.
    await page.goto("/habits");
    await expect(page.getByText(/of 1 days/).first()).toBeVisible();

    const { count } = await admin
      .from("habit_logs")
      .select("habit_id", { count: "exact", head: true })
      .eq("habit_id", habit!.id);
    expect(count).toBe(1);
  });

  test("momentum is never offered as something to reset", async ({ authedPage: page }) => {
    await page.goto("/settings");
    const section = page.locator("section").filter({ hasText: "Fresh start" }).first();
    // The promise is stated, not quietly dropped.
    await expect(section).toContainText(/momentum strip is never reset/i);
  });
});
