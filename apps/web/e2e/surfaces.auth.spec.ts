import { randomUUID } from "node:crypto";
import { test, expect, hasSupabaseAdmin, seedTodayTask } from "./fixtures/auth";

// The round-2 surfaces: the daily arc, the timed agenda, and the review flow.
test.describe("agenda, review and the daily arc", () => {
  test.skip(!hasSupabaseAdmin, "set SUPABASE_SECRET_KEY (in .env.local) to run signed-in E2E");

  test("the daily arc renders on Today with a peak window", async ({ authedPage: page }) => {
    await page.goto("/today");
    const arc = page.locator("section[aria-label='Daily arc']");
    await expect(arc).toBeVisible();
    await expect(arc).toContainText(/Energy flow/i);
    // The fixture widens working hours, so the arc always has a span to draw.
    await expect(arc.locator("svg")).toBeVisible();
    await expect(arc).toContainText(/% through/);
  });

  test("agenda lists the day's work as done and pending", async ({
    authedPage: page,
    admin,
    testUserId,
  }) => {
    const pending = `E2E pending ${randomUUID().slice(0, 6)}`;
    const finished = `E2E finished ${randomUUID().slice(0, 6)}`;
    await seedTodayTask(admin, testUserId, pending);
    await seedTodayTask(admin, testUserId, finished, { status: "done" });

    await page.goto("/agenda");
    await expect(page.getByRole("heading", { name: "Agenda" })).toBeVisible();

    // Both appear, and the summary counts one of two as done.
    await expect(page.getByText(pending)).toBeVisible();
    await expect(page.getByText(finished)).toBeVisible();
    await expect(page.locator("section[aria-label='Day summary']")).toContainText("1/2");

    // No guilt language anywhere on the day's read.
    await expect(page.getByText(/overdue/i)).toHaveCount(0);
  });

  test("review carries an unfinished task into tomorrow and stars it", async ({
    authedPage: page,
    admin,
    testUserId,
  }) => {
    const title = `E2E carry ${randomUUID().slice(0, 6)}`;
    await seedTodayTask(admin, testUserId, title);

    await page.goto("/review");
    const carrying = page.locator("section[aria-label='Carrying into tomorrow']");
    await expect(carrying).toContainText(title);

    // Move it to tomorrow — it leaves the carry-over list...
    await carrying.getByRole("button", { name: "Tomorrow", exact: true }).click();
    await expect(carrying.getByText(title)).toHaveCount(0);

    // ...and becomes selectable as one of tomorrow's Big 3.
    const tomorrow = page.locator("section[aria-label='Tomorrow']");
    const row = tomorrow.locator("li").filter({ hasText: title });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Add to tomorrow's Big 3" }).click();
    await expect(tomorrow).toContainText("1 of 3 chosen");
  });

  test("review reaches the day with nothing left over calmly", async ({
    authedPage: page,
  }) => {
    await page.goto("/review");
    await expect(
      page.locator("section[aria-label='Carrying into tomorrow']"),
    ).toContainText(/Nothing left over/i);
    // "overdue" appears here only as a reassurance, never as a badge — assert
    // the promise itself rather than the mere absence of the word.
    await expect(page.getByText(/nothing here is overdue/i)).toBeVisible();
  });
});
