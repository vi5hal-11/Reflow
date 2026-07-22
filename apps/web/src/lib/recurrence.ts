import type { RecurrenceFreq } from "./types";

// The chain model: completing a recurring task spawns the next occurrence.
// Pure date math — no timezone drift beyond the browser-local day the rest of
// the app already uses.
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function nextOccurrenceDate(freq: RecurrenceFreq, fromDate: string | null): string {
  const base = fromDate ? new Date(`${fromDate}T00:00:00`) : new Date();
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  switch (freq) {
    case "daily":
      d.setDate(d.getDate() + 1);
      break;
    case "weekdays":
      do {
        d.setDate(d.getDate() + 1);
      } while (d.getDay() === 0 || d.getDay() === 6);
      break;
    case "weekly":
      d.setDate(d.getDate() + 7);
      break;
    case "monthly":
      d.setMonth(d.getMonth() + 1);
      break;
  }
  return ymd(d);
}

export const RECURRENCE_LABEL: Record<RecurrenceFreq, string> = {
  daily: "Daily",
  weekdays: "Weekdays",
  weekly: "Weekly",
  monthly: "Monthly",
};

type RecurringSource = {
  title: string;
  estimated_minutes: number | null;
  energy_tag: string | null;
  priority?: number;
  planned_date: string | null;
  scheduled_start: string | null;
  recurrence: RecurrenceFreq | null;
};

// Build the insert for the next occurrence of a just-completed recurring task.
export function nextRecurringInsert(task: RecurringSource, userId: string) {
  const from =
    task.planned_date ??
    (task.scheduled_start ? task.scheduled_start.slice(0, 10) : null);
  return {
    user_id: userId,
    title: task.title,
    status: "todo" as const,
    estimated_minutes: task.estimated_minutes,
    energy_tag: task.energy_tag,
    priority: task.priority ?? 2,
    is_big3: false,
    planned_date: nextOccurrenceDate(task.recurrence!, from),
    recurrence: task.recurrence,
    source: "manual" as const,
  };
}
