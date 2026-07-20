import { createAdminClient } from "@/lib/supabase/admin";
import type { CalendarStatus } from "./types";

export function calendarAvailable(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.SUPABASE_SECRET_KEY,
  );
}

// Server-only seam: the day view's server page calls this to learn whether
// to show calendar UI. Connected iff a calendar_connections row exists —
// that table is service-role-only, hence the admin client. Any trouble
// degrades to "not connected"; the day view must never break over calendar
// plumbing.
export async function getCalendarStatus(userId: string): Promise<CalendarStatus> {
  if (!calendarAvailable()) return { available: false, connected: false };
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("calendar_connections")
      .select("google_email, last_synced_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) return { available: true, connected: false };
    return {
      available: true,
      connected: true,
      googleEmail: (data.google_email as string | null) ?? null,
      lastSyncedAt: (data.last_synced_at as string | null) ?? null,
    };
  } catch {
    return { available: true, connected: false };
  }
}
