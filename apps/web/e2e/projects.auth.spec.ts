import { randomUUID } from "node:crypto";
import { test, expect, hasSupabaseAdmin, seedTodayTask } from "./fixtures/auth";

// Projects CRUD + assignment (Phase 10 stream B). Needs the Supabase service
// key to seed the test account; skips itself without one.
test.describe("projects", () => {
  test.skip(!hasSupabaseAdmin, "set SUPABASE_SECRET_KEY (in .env.local) to run signed-in E2E");

  test("create → rename → archive a project", async ({ authedPage: page }) => {
    await page.goto("/projects");
    const name = `Proj ${randomUUID().slice(0, 6)}`;

    await page.getByPlaceholder("New project name").fill(name);
    await page.getByRole("button", { name: "Add project" }).click();

    const row = page.locator("li").filter({ hasText: name });
    await expect(row).toBeVisible();
    await expect(row).toContainText("empty");

    // Rename via the pencil → inline input.
    await row.getByRole("button", { name: "Rename project" }).click();
    const renamed = `${name} renamed`;
    const input = page.getByRole("textbox", { name: "Project name", exact: true });
    await input.fill(renamed);
    await input.press("Enter");
    await expect(page.locator("li").filter({ hasText: renamed })).toBeVisible();

    // Archive → it moves under the Archived section, offering Restore.
    await page
      .locator("li")
      .filter({ hasText: renamed })
      .getByRole("button", { name: "Archive project" })
      .click();
    await expect(
      page
        .locator("li")
        .filter({ hasText: renamed })
        .getByRole("button", { name: "Restore project" }),
    ).toBeVisible();
  });

  test("assign a project from the edit sheet, then filter the inbox by it", async ({
    authedPage: page,
    admin,
    testUserId,
  }) => {
    // A project to assign, and an inbox item to assign it to.
    const projectName = `Bucket ${randomUUID().slice(0, 6)}`;
    await admin.from("projects").insert({ user_id: testUserId, name: projectName });
    const taskTitle = `E2E assign ${randomUUID().slice(0, 6)}`;
    await seedTodayTask(admin, testUserId, taskTitle, { status: "inbox", planned_date: null });

    await page.goto("/inbox");
    const row = page.locator("main ul li").filter({ hasText: taskTitle });
    await expect(row).toBeVisible();

    // Open the edit sheet, pick the project, save.
    await row.getByRole("button", { name: taskTitle }).click();
    const sheet = page.getByRole("dialog", { name: "Edit task" });
    await sheet.getByRole("button", { name: projectName }).click();
    await sheet.getByRole("button", { name: "Save" }).click();
    await expect(sheet).toBeHidden();

    // The task now carries the project chip.
    await expect(row).toContainText(projectName);

    // Filtering by the project keeps it; filtering by "No project" hides it.
    await page.getByRole("button", { name: projectName }).click();
    await expect(row).toBeVisible();
    await page.getByRole("button", { name: "No project" }).click();
    await expect(page.locator("main ul li").filter({ hasText: taskTitle })).toHaveCount(0);
  });
});
