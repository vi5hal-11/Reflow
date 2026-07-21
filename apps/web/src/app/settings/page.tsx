import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCalendarStatus } from "@/lib/calendar/status";
import type { CalendarStatus } from "@/lib/calendar/types";
import type { DayProfile } from "@/lib/types";
import { SettingsClient } from "./settings-client";

export const metadata = { title: "Settings — Reflow" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, calendarStatus] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "display_name, timezone, working_hours_start, working_hours_end, default_buffer_minutes, energy_profile",
      )
      .eq("id", user.id)
      .single(),
    getCalendarStatus(user.id),
  ]);

  const fallback: DayProfile & { display_name: string | null } = {
    display_name: null,
    timezone: "UTC",
    working_hours_start: "09:00:00",
    working_hours_end: "18:00:00",
    default_buffer_minutes: 10,
    energy_profile: null,
  };

  return (
    <SettingsClient
      userId={user.id}
      profile={
        (profile as (DayProfile & { display_name: string | null }) | null) ??
        fallback
      }
      calendar={calendarStatus as CalendarStatus}
    />
  );
}
