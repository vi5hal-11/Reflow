import type { SupabaseClient } from "@supabase/supabase-js";

// "Fresh start" — the way back in after a stretch of not logging.
//
// Two deliberate constraints shape this:
//   1. Nothing is deleted. Backlog tasks move to Later (still in the inbox,
//      still searchable); habit grids get a line drawn under them rather than
//      their check-ins erased. Both are undoable.
//   2. Momentum is never touched. CLAUDE.md §7 promises it dims but never
//      resets, and "you've shown up 8 of the last 20 days" is only worth
//      saying while it's true.

export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * Everything still waiting on today or any day before it — the pile that
 * accumulates because unfinished work rolls forward every day.
 */
export async function countBacklog(
  supabase: SupabaseClient,
  today = localToday(),
): Promise<number> {
  const { count } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .in("status", ["todo", "rolled"])
    .eq("is_optional", false)
    .lte("planned_date", today);
  return count ?? 0;
}

/**
 * Set the backlog down: clear its claim on a day so it leaves Today, keeping
 * every task in the inbox under "Later". Returns the ids moved so the caller
 * can offer an undo.
 */
export async function clearBacklog(
  supabase: SupabaseClient,
  today = localToday(),
): Promise<{ ids: string[]; error: boolean }> {
  const { data: rows, error: readError } = await supabase
    .from("tasks")
    .select("id")
    .in("status", ["todo", "rolled"])
    .eq("is_optional", false)
    .lte("planned_date", today);

  if (readError) return { ids: [], error: true };
  const ids = (rows ?? []).map((r) => r.id as string);
  if (ids.length === 0) return { ids: [], error: false };

  const { error } = await supabase
    .from("tasks")
    .update({
      planned_date: null,
      status: "todo",
      is_big3: false,
      scheduled_start: null,
      scheduled_end: null,
    })
    .in("id", ids);

  return { ids, error: Boolean(error) };
}

/** Put a cleared backlog back on today, exactly as it was found. */
export async function restoreBacklog(
  supabase: SupabaseClient,
  ids: string[],
  today = localToday(),
): Promise<boolean> {
  if (ids.length === 0) return true;
  const { error } = await supabase
    .from("tasks")
    .update({ planned_date: today, status: "rolled" })
    .in("id", ids);
  return !error;
}

/**
 * Draw a line under every habit's history: grids and consistency count from
 * today forward. Past check-ins are kept, just no longer counted.
 */
export async function freshStartHabits(
  supabase: SupabaseClient,
  userId: string,
  on = localToday(),
): Promise<boolean> {
  const { error } = await supabase
    .from("habits")
    .update({ fresh_start_on: on })
    .eq("user_id", userId);
  return !error;
}

/** Undo the line — the full history counts again. */
export async function undoFreshStartHabits(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { error } = await supabase
    .from("habits")
    .update({ fresh_start_on: null })
    .eq("user_id", userId);
  return !error;
}
