import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { dayTaskColumns, type DayTask, type MomentumDay } from "@/lib/types";
import { ReviewClient } from "./review-client";

export const metadata = { title: "Review — Reflow" };

function shift(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// The end-of-day flow: how today went → what's carrying over → tomorrow's Big 3.
// A generous date range is fetched; the client trims to its own local days.
export default async function ReviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: tasks }, { data: momentum }] = await Promise.all([
    supabase
      .from("tasks")
      .select(dayTaskColumns)
      .neq("status", "inbox")
      .gte("planned_date", shift(-8))
      .lte("planned_date", shift(2))
      .order("created_at", { ascending: true }),
    supabase
      .from("momentum")
      .select("metric_date, active")
      .gte("metric_date", shift(-8))
      .order("metric_date", { ascending: true }),
  ]);

  return (
    <ReviewClient
      userId={user.id}
      initialTasks={(tasks ?? []) as DayTask[]}
      momentum={(momentum ?? []) as MomentumDay[]}
    />
  );
}
