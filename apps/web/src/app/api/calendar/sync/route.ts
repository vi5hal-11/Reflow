import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { calendarAvailable } from "@/lib/calendar/status";
import { listEvents, type GoogleEvent } from "@/lib/calendar/google";
import { getAccessToken, getConnection } from "../connection";
import type { DayCalendarEvent } from "@/lib/types";
import type { CalendarSyncResult } from "@/lib/calendar/types";

const isoDatetime = z.iso.datetime({ offset: true });

const MAX_WINDOW_MS = 32 * 24 * 60 * 60 * 1_000;

// The client owns local-day math (see DECISIONS.md) and sends the concrete
// window (local yesterday → +7 days). Validated hard: this window bounds
// every cache mutation below.
const bodySchema = z
  .object({ windowStart: isoDatetime, windowEnd: isoDatetime })
  .refine((b) => {
    const span = Date.parse(b.windowEnd) - Date.parse(b.windowStart);
    return span > 0 && span <= MAX_WINDOW_MS;
  }, "windowEnd must follow windowStart within 32 days");

type CachedRow = {
  id: string;
  google_event_id: string;
  title: string | null;
  start: string;
  end: string;
  is_busy: boolean;
};

const sameInstant = (a: string, b: string) => new Date(a).getTime() === new Date(b).getTime();

const degraded = () => NextResponse.json({ degraded: true }, { status: 503 });

// Pull Google events into the calendar_events cache for the given window.
// Strictly window-scoped: rows outside [windowStart, windowEnd] are never
// touched. `changed` is true iff the cache actually mutated — the client
// only re-flows the plan when something out there really moved.
export async function POST(request: Request) {
  const parsedBody = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const { windowStart, windowEnd } = parsedBody.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!calendarAvailable()) {
    return NextResponse.json({ connected: false }, { status: 409 });
  }
  const admin = createAdminClient();
  const connection = await getConnection(admin, user.id);
  if (!connection) {
    return NextResponse.json({ connected: false }, { status: 409 });
  }

  let googleEvents: GoogleEvent[];
  try {
    const accessToken = await getAccessToken(admin, connection);
    googleEvents = await listEvents(accessToken, connection.calendar_id, windowStart, windowEnd);
  } catch {
    return degraded();
  }

  // THE critical exclusion: events Reflow itself pushed (marked with the
  // reflow_task_id extended property) must never enter the cache. Cached,
  // they'd come back as fixed blocks and the scheduler would deadlock on
  // its own output. Also trim to events *starting* in-window — that is the
  // cache's window key (plan + day view both filter on `start`).
  const startMs = Date.parse(windowStart);
  const endMs = Date.parse(windowEnd);
  const externalEvents = googleEvents.filter((e) => {
    if (e.reflowTaskId !== null) return false;
    const eventStart = Date.parse(e.start);
    return eventStart >= startMs && eventStart <= endMs;
  });

  // Current in-window cache (Google-sourced rows only — rows without a
  // google_event_id, if any ever exist, aren't ours to manage).
  const { data: cacheData, error: cacheError } = await admin
    .from("calendar_events")
    .select("id, google_event_id, title, start, end, is_busy")
    .eq("user_id", user.id)
    .not("google_event_id", "is", null)
    .gte("start", windowStart)
    .lte("start", windowEnd);
  if (cacheError) return degraded();
  const cached = (cacheData ?? []) as CachedRow[];
  const cachedByGoogleId = new Map(cached.map((row) => [row.google_event_id, row]));

  // Upsert only rows that genuinely differ, so `changed` is exact.
  const syncedAt = new Date().toISOString();
  const upserts: Array<Record<string, unknown>> = [];
  for (const event of externalEvents) {
    const isBusy = !event.transparent;
    const existing = cachedByGoogleId.get(event.id);
    const identical =
      existing !== undefined &&
      existing.title === event.summary &&
      existing.is_busy === isBusy &&
      sameInstant(existing.start, event.start) &&
      sameInstant(existing.end, event.end);
    if (identical) continue;
    upserts.push({
      user_id: user.id,
      google_event_id: event.id,
      title: event.summary,
      start: event.start,
      end: event.end,
      is_busy: isBusy,
      synced_at: syncedAt,
    });
  }

  // In-window cache rows Google no longer returns → stale, delete by row id.
  const liveIds = new Set(externalEvents.map((e) => e.id));
  const staleRowIds = cached
    .filter((row) => !liveIds.has(row.google_event_id))
    .map((row) => row.id);

  if (upserts.length > 0) {
    const { error } = await admin
      .from("calendar_events")
      .upsert(upserts, { onConflict: "user_id,google_event_id" });
    if (error) return degraded();
  }
  if (staleRowIds.length > 0) {
    const { error } = await admin
      .from("calendar_events")
      .delete()
      .eq("user_id", user.id)
      .in("id", staleRowIds);
    if (error) return degraded();
  }
  const changed = upserts.length > 0 || staleRowIds.length > 0;

  await admin
    .from("calendar_connections")
    .update({ last_synced_at: syncedAt })
    .eq("user_id", user.id);

  // The client replaces its event state wholesale — return the full
  // in-window cache (busy and transparent alike), in day order.
  const { data: finalData, error: finalError } = await admin
    .from("calendar_events")
    .select("id, title, start, end, is_busy")
    .eq("user_id", user.id)
    .gte("start", windowStart)
    .lte("start", windowEnd)
    .order("start", { ascending: true });
  if (finalError) return degraded();

  const response: CalendarSyncResult = {
    events: (finalData ?? []) as DayCalendarEvent[],
    changed,
  };
  return NextResponse.json(response);
}
