import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  blockedWindowColumns,
  dayProfileColumns,
  type BlockedWindow,
  type DayProfile,
} from "@/lib/types";
import { SettingsClient } from "./settings-client";

export const metadata = { title: "Settings — Reflow" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: blocked }] = await Promise.all([
    supabase
      .from("profiles")
      .select(`display_name, ${dayProfileColumns}`)
      .eq("id", user.id)
      .single(),
    supabase
      .from("blocked_windows")
      .select(blockedWindowColumns)
      .order("start_time", { ascending: true }),
  ]);

  const fallback: DayProfile & { display_name: string | null } = {
    display_name: null,
    timezone: "UTC",
    working_hours_start: "09:00:00",
    working_hours_end: "18:00:00",
    default_buffer_minutes: 10,
    energy_profile: null,
    max_deep_minutes: null,
    max_scheduled_minutes: null,
  };

  return (
    <SettingsClient
      userId={user.id}
      profile={
        (profile as (DayProfile & { display_name: string | null }) | null) ??
        fallback
      }
      initialBlocked={(blocked ?? []) as BlockedWindow[]}
    />
  );
}
