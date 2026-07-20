import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteEvent, refreshAccessToken } from "@/lib/calendar/google";

// Shared plumbing for the calendar routes (and the plan route's push).
// calendar_connections is service-role-only, so everything here takes the
// admin client explicitly — there is no user-scoped path to this table.

// CSRF nonce cookie for the OAuth round-trip. SameSite=Lax is enough: the
// callback arrives as a top-level GET navigation, which Lax cookies join.
export const STATE_COOKIE = "reflow_calendar_state";
export const STATE_COOKIE_PATH = "/api/calendar";
export const STATE_COOKIE_MAX_AGE_SECONDS = 600;

export type CalendarConnection = {
  user_id: string;
  google_email: string | null;
  refresh_token: string;
  access_token: string | null;
  token_expiry: string | null;
  calendar_id: string;
  last_synced_at: string | null;
};

export async function getConnection(
  admin: SupabaseClient,
  userId: string,
): Promise<CalendarConnection | null> {
  const { data, error } = await admin
    .from("calendar_connections")
    .select(
      "user_id, google_email, refresh_token, access_token, token_expiry, calendar_id, last_synced_at",
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data as CalendarConnection;
}

const EXPIRY_SLACK_MS = 60_000;

// A usable access token: the stored one if it still has a minute of life,
// otherwise a fresh one (persisted best-effort so the next request skips the
// refresh). Throws GoogleApiError when Google refuses the refresh.
export async function getAccessToken(
  admin: SupabaseClient,
  connection: CalendarConnection,
): Promise<string> {
  if (
    connection.access_token &&
    connection.token_expiry &&
    new Date(connection.token_expiry).getTime() - Date.now() > EXPIRY_SLACK_MS
  ) {
    return connection.access_token;
  }
  const refreshed = await refreshAccessToken(connection.refresh_token);
  await admin
    .from("calendar_connections")
    .update({ access_token: refreshed.accessToken, token_expiry: refreshed.tokenExpiry })
    .eq("user_id", connection.user_id);
  return refreshed.accessToken;
}

// Disconnect: best-effort delete of the Google events we pushed (never let a
// Google hiccup block the user from unlinking), then drop the connection row
// and detach tasks from their pushed events.
export async function disconnectCalendar(
  admin: SupabaseClient,
  userId: string,
): Promise<void> {
  const connection = await getConnection(admin, userId);
  if (connection) {
    try {
      const { data: pushed } = await admin
        .from("tasks")
        .select("id, google_event_id")
        .eq("user_id", userId)
        .not("google_event_id", "is", null);
      if (pushed && pushed.length > 0) {
        const accessToken = await getAccessToken(admin, connection);
        for (const task of pushed) {
          try {
            await deleteEvent(accessToken, connection.calendar_id, task.google_event_id as string);
          } catch {
            // best-effort — an orphaned Google event is the user's to tidy
          }
        }
      }
    } catch {
      // best-effort — disconnecting must always succeed locally
    }
  }
  await admin.from("calendar_connections").delete().eq("user_id", userId);
  await admin
    .from("tasks")
    .update({ google_event_id: null })
    .eq("user_id", userId)
    .not("google_event_id", "is", null);
}
