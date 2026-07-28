import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { dayTaskColumns, type DayTask } from "@/lib/types";
import { AgendaClient } from "./agenda-client";

export const metadata = { title: "Agenda — Reflow" };

// A timed read of the day: what's done, what's still ahead, and when.
// Deliberately read-only — Today owns placing and completing, so there is only
// ever one source of truth for those actions.
export default async function AgendaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Generous ±36h window; the client trims to its exact local day (day math is
  // browser-local throughout the app — see DECISIONS.md).
  const nowMs = new Date().getTime();
  const windowStart = new Date(nowMs - 36 * 60 * 60 * 1000).toISOString();
  const windowEnd = new Date(nowMs + 36 * 60 * 60 * 1000).toISOString();
  const today = new Date().toISOString().slice(0, 10);

  const { data: tasks } = await supabase
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
    .order("created_at", { ascending: true });

  return <AgendaClient initialTasks={(tasks ?? []) as DayTask[]} />;
}
