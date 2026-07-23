import { test as base, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Signed-in E2E needs a real, confirmed Supabase user. We seed one with the
// service key (bypasses RLS + email confirmation), sign in through the actual
// login form so the whole auth path is exercised, and wipe the account's rows
// before each test for isolation. Without the admin key present, every spec
// that uses `authedPage` skips itself — CI stays green on the public smoke.

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_SECRET = process.env.SUPABASE_SECRET_KEY;

/** True only when a service key is available to seed the test user. */
export const hasSupabaseAdmin = Boolean(SUPA_URL && SUPA_SECRET);

const TEST_EMAIL = process.env.E2E_TEST_EMAIL ?? "e2e-runner@reflow.test";
// Must satisfy the login form's 8-char minimum.
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? "reflow-e2e-pw-2026";

type WorkerFixtures = {
  admin: SupabaseClient;
  testUserId: string;
};

type TestFixtures = {
  /** A page already signed in as the seeded user, on a cleaned account. */
  authedPage: Page;
};

async function findUserByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<string | null> {
  const target = email.toLowerCase();
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error || data.users.length === 0) return null;
    const match = data.users.find((u) => u.email?.toLowerCase() === target);
    if (match) return match.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function ensureTestUser(admin: SupabaseClient): Promise<string> {
  const created = await admin.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (created.data.user) return created.data.user.id;

  // Likely "already registered" — find the row and normalize its credentials
  // so a password change or unconfirmed state from a prior run can't wedge us.
  const existing = await findUserByEmail(admin, TEST_EMAIL);
  if (!existing) {
    throw new Error(
      `Could not create or find the E2E test user (${TEST_EMAIL}): ${
        created.error?.message ?? "unknown error"
      }`,
    );
  }
  await admin.auth.admin.updateUserById(existing, {
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  return existing;
}

/** Browser-local today as YYYY-MM-DD — matches how the client writes planned_date. */
export function localTodayISODate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * Insert a flexible task scheduled for today, bypassing capture + the LLM
 * parse step so its title is stable (parse can rewrite titles at high
 * confidence, which would make title lookups on /today flaky). Returns the id.
 */
export async function seedTodayTask(
  admin: SupabaseClient,
  userId: string,
  title: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const { data, error } = await admin
    .from("tasks")
    .insert({
      user_id: userId,
      title,
      raw_text: title,
      status: "todo",
      planned_date: localTodayISODate(),
      source: "manual",
      ...extra,
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`seedTodayTask failed: ${error?.message ?? "no row returned"}`);
  }
  return data.id as string;
}

/** Wipe the test account's core-loop rows so each test starts from zero. */
async function resetUserData(admin: SupabaseClient, userId: string) {
  await admin.from("tasks").delete().eq("user_id", userId);
  await admin.from("daily_plans").delete().eq("user_id", userId);
  await admin.from("momentum").delete().eq("user_id", userId);
  await admin.from("estimate_history").delete().eq("user_id", userId);
}

/**
 * Full-day working hours make timeline placement independent of wall-clock:
 * "now" is always inside the window, so a free gap always exists to place into.
 */
async function widenWorkingHours(admin: SupabaseClient, userId: string) {
  await admin
    .from("profiles")
    .update({ working_hours_start: "00:00", working_hours_end: "23:59" })
    .eq("id", userId);
}

async function signInThroughForm(page: Page) {
  await page.goto("/login");
  await page.getByPlaceholder("you@example.com").fill(TEST_EMAIL);
  await page.getByPlaceholder(/password/).fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page
    .waitForURL(/\/inbox/, { timeout: 20_000 })
    .catch(() => {
      throw new Error(
        "Sign-in did not reach /inbox — check the seeded user, the Supabase " +
          "URL/key in .env.local, and that email+password auth is enabled.",
      );
    });
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  admin: [
    async ({}, use) => {
      const admin = createClient(SUPA_URL!, SUPA_SECRET!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      await use(admin);
    },
    { scope: "worker" },
  ],

  testUserId: [
    async ({ admin }, use) => {
      const id = await ensureTestUser(admin);
      await use(id);
    },
    { scope: "worker" },
  ],

  authedPage: async ({ page, admin, testUserId }, use) => {
    await resetUserData(admin, testUserId);
    await widenWorkingHours(admin, testUserId);
    await signInThroughForm(page);
    await use(page);
  },
});

export { expect };
