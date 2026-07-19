import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  dayTaskColumns,
  type DayCalendarEvent,
  type DayProfile,
  type DayTask,
} from "@/lib/types";
import { TodayClient } from "./today-client";

export const metadata = { title: "Today — Reflow" };

// Server-side "today" in the profile's timezone. planned_date is written from
// the browser's local date, so the client re-filters against its own day —
// this only bounds the fetch (with a generous window) so first paint is fast.
function dateInTimezone(tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export default async function TodayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "timezone, working_hours_start, working_hours_end, default_buffer_minutes, energy_profile",
    )
    .eq("id", user.id)
    .single();

  const tz = profile?.timezone ?? "UTC";
  const today = dateInTimezone(tz);
  // Generous ±36h window; the client trims to its exact local day.
  const nowMs = new Date().getTime();
  const windowStart = new Date(nowMs - 36 * 60 * 60 * 1000).toISOString();
  const windowEnd = new Date(nowMs + 36 * 60 * 60 * 1000).toISOString();

  const [{ data: tasks }, { data: events }, { data: plan }] = await Promise.all([
    supabase
      .from("tasks")
      .select(dayTaskColumns)
      .neq("status", "inbox")
      .or(
        [
          `planned_date.eq.${today}`,
          `and(scheduled_start.gte.${windowStart},scheduled_start.lte.${windowEnd})`,
          `and(is_fixed.eq.true,fixed_start.gte.${windowStart},fixed_start.lte.${windowEnd})`,
        ].join(","),
      )
      .order("created_at", { ascending: true }),
    supabase
      .from("calendar_events")
      .select("id, title, start, end, is_busy")
      .gte("start", windowStart)
      .lte("start", windowEnd),
    supabase
      .from("daily_plans")
      .select("id, plan_date, big3_task_ids")
      .eq("plan_date", today)
      .maybeSingle(),
  ]);

  const fallbackProfile: DayProfile = {
    timezone: tz,
    working_hours_start: "09:00:00",
    working_hours_end: "18:00:00",
    default_buffer_minutes: 10,
    energy_profile: null,
  };

  return (
    <TodayClient
      userId={user.id}
      profile={(profile as DayProfile | null) ?? fallbackProfile}
      initialTasks={(tasks ?? []) as DayTask[]}
      calendarEvents={(events ?? []) as DayCalendarEvent[]}
      initialBig3Ids={(plan?.big3_task_ids as string[] | null) ?? []}
    />
  );
}
