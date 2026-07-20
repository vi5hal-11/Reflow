import type { DayCalendarEvent } from "@/lib/types";

// What the day view knows about the user's calendar link. "available"
// means the server has Google OAuth + secret-key env configured at all;
// UI shows no calendar affordance when the feature isn't available.
export type CalendarStatus =
  | { available: false; connected: false }
  | { available: true; connected: false }
  | {
      available: true;
      connected: true;
      googleEmail: string | null;
      lastSyncedAt: string | null;
    };

// POST /api/calendar/sync → 200. Other outcomes:
// 401 unauthorized · 409 { connected: false } · 503 { degraded: true }.
export type CalendarSyncResult = {
  events: DayCalendarEvent[];
  changed: boolean;
};
