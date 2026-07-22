import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { dayTaskColumns, type DayTask } from "@/lib/types";
import { FocusClient } from "./focus-client";

export const metadata = { title: "Focus — Reflow" };

// Focus mode operates on today's scheduled flexible blocks — the things you
// actually *do*. Generous ±36h fetch; the client trims to its local day.
export default async function FocusPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const nowMs = new Date().getTime();
  const windowStart = new Date(nowMs - 36 * 60 * 60 * 1000).toISOString();
  const windowEnd = new Date(nowMs + 36 * 60 * 60 * 1000).toISOString();

  const { data: tasks } = await supabase
    .from("tasks")
    .select(dayTaskColumns)
    .in("status", ["scheduled", "done"])
    .eq("is_fixed", false)
    .gte("scheduled_start", windowStart)
    .lte("scheduled_start", windowEnd)
    .order("scheduled_start", { ascending: true });

  return <FocusClient userId={user.id} initialTasks={(tasks ?? []) as DayTask[]} />;
}
