import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { HabitsClient, type Habit, type HabitLog } from "./habits-client";

export const metadata = { title: "Habits — Reflow" };

export default async function HabitsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const since = new Date();
  since.setDate(since.getDate() - 20);
  const sinceStr = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, "0")}-${String(since.getDate()).padStart(2, "0")}`;

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const [{ data: habits }, { data: logs }, { data: mood }] = await Promise.all([
    supabase
      .from("habits")
      .select("id, title, icon, color, kind, cadence, target_per_week, position")
      .eq("archived", false)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("habit_logs")
      .select("habit_id, log_date, minutes")
      .gte("log_date", sinceStr),
    supabase
      .from("mood_logs")
      .select("mood, note")
      .eq("log_date", todayStr)
      .maybeSingle(),
  ]);

  return (
    <HabitsClient
      userId={user.id}
      today={todayStr}
      initialHabits={(habits ?? []) as Habit[]}
      initialLogs={(logs ?? []) as HabitLog[]}
      initialMood={mood?.mood ?? null}
      initialMoodNote={mood?.note ?? null}
    />
  );
}
