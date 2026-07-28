import { randomUUID } from "node:crypto";
import { test, expect, hasSupabaseAdmin } from "./fixtures/auth";

// The considered capture sheet (mockup 1): types, and the promise that only a
// task can ever reach the planner.
test.describe("capture sheet", () => {
  test.skip(!hasSupabaseAdmin, "set SUPABASE_SECRET_KEY (in .env.local) to run signed-in E2E");

  test("captures a task straight onto today as a Big 3", async ({ authedPage: page }) => {
    const title = `E2E sheet ${randomUUID().slice(0, 6)}`;

    await page.goto("/inbox");
    await page.getByRole("button", { name: "Open the full capture sheet" }).click();

    const sheet = page.getByRole("dialog", { name: "New capture" });
    await expect(sheet).toBeVisible();
    await sheet.getByPlaceholder(/What's on your mind/).fill(title);

    // Starring for the Big 3 implies putting it on today.
    await sheet.getByRole("button", { name: "Add to Big 3 for today" }).click();
    await expect(sheet.getByRole("button", { name: "Plan it for today" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await sheet.getByRole("button", { name: /Save & settle/ }).click();
    await expect(sheet).toBeHidden();

    // It landed on the day, not just the inbox.
    await expect(page.getByText(/1 for today/)).toBeVisible();
    await page.goto("/today");
    await expect(
      page.locator("section[aria-label='Daily Big 3']").getByText(title),
    ).toBeVisible();
  });

  test("an idea is kept but never schedulable", async ({ authedPage: page }) => {
    const title = `E2E idea ${randomUUID().slice(0, 6)}`;

    await page.goto("/inbox");
    await page.getByRole("button", { name: "Open the full capture sheet" }).click();

    const sheet = page.getByRole("dialog", { name: "New capture" });
    await sheet.getByPlaceholder(/What's on your mind/).fill(title);
    await sheet.getByRole("button", { name: "Idea", exact: true }).click();

    // Placement options disappear — an idea has no day to land on.
    await expect(sheet.getByRole("button", { name: "Plan it for today" })).toHaveCount(0);
    await sheet.getByRole("button", { name: /Save & settle/ }).click();
    await expect(sheet).toBeHidden();

    // It's kept in the inbox, tagged, and offers no way to schedule it.
    const row = page.locator("main ul li").filter({ hasText: title });
    await expect(row).toBeVisible();
    await expect(row).toContainText("Idea");
    await expect(row.getByRole("button", { name: "Today", exact: true })).toHaveCount(0);

    // And nothing about keeping it reads as overdue.
    await expect(page.getByText(/overdue/i)).toHaveCount(0);
  });
});
