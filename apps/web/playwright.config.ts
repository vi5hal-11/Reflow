import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";

// Load .env.local into the test process (Next loads it for the server, but the
// auth fixtures need SUPABASE_SECRET_KEY here too). Minimal parser — no dep.
// Missing file is the CI path: real env vars (or none) stand, signed-in specs
// skip themselves.
function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      const [, key, rawVal] = m;
      if (process.env[key] !== undefined) continue; // never override real env
      const val =
        (rawVal.startsWith('"') && rawVal.endsWith('"')) ||
        (rawVal.startsWith("'") && rawVal.endsWith("'"))
          ? rawVal.slice(1, -1)
          : rawVal;
      process.env[key] = val;
    }
  } catch {
    // no .env.local — rely on the ambient environment
  }
}
loadEnvLocal();

// The signed-in suite (core-loop.auth.spec.ts) needs a Supabase admin key to
// seed a confirmed test user; the smoke suite needs nothing. Both projects run
// both; auth specs skip themselves when the key is absent (CI-safe).
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Signed-in specs mutate one shared test account — serialize workers so two
  // runners don't fight over its rows. Public smoke is order-independent.
  workers: process.env.CI ? 1 : 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run start",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
