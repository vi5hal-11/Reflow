import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { dayTaskColumns, type DayTask } from "@/lib/types";
import { WeekClient } from "./week-client";

export const metadata = { title: "Week — Reflow" };

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Fetch a generous window (planned_date range + scheduled window, ±a day at the
// edges); the client buckets into its exact 7 local days.
export default async function WeekPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const now = new Date();
  const lo = ymd(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const hi = ymd(new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000));
  const winStart = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const winEnd = new Date(now.getTime() + 9 * 24 * 60 * 60 * 1000).toISOString();

  const { data: tasks } = await supabase
    .from("tasks")
    .select(dayTaskColumns)
    .neq("status", "inbox")
    .or(
      [
        `and(planned_date.gte.${lo},planned_date.lte.${hi})`,
        `and(scheduled_start.gte.${winStart},scheduled_start.lte.${winEnd})`,
        `and(is_fixed.eq.true,fixed_start.gte.${winStart},fixed_start.lte.${winEnd})`,
      ].join(","),
    );

  return <WeekClient tasks={(tasks ?? []) as DayTask[]} />;
}
