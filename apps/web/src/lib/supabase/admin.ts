import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only Supabase client authenticated with the secret key (sb_secret_…).
// It bypasses RLS, which makes it the ONLY legitimate path to
// calendar_connections (RLS enabled, deliberately zero policies — refresh
// tokens must never be readable from the browser).
//
// Never import this from anything that can reach the client bundle. The guard
// below makes such a mistake fail loudly instead of silently shipping a
// privileged client to the browser.
if (typeof window !== "undefined") {
  throw new Error(
    "lib/supabase/admin is server-only and must never be imported into client code.",
  );
}

export function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    throw new Error(
      "createAdminClient requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY. " +
        "Check calendarAvailable() before calling — without the env, calendar " +
        "sync is unavailable and the app runs in its Phase 3 shape.",
    );
  }
  return createSupabaseClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
