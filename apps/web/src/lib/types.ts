import { z } from "zod";

export const energyTags = ["deep", "shallow", "admin"] as const;
export type EnergyTag = (typeof energyTags)[number];

// What a capture actually is. Only "task" reaches the scheduler — ideas and
// notes are kept out of the planner entirely, so they can never crowd the day
// or read as overdue. ("Feeling" is deliberately absent: the mood check-in
// already owns that, and a second feelings channel would split the data.)
export const taskKinds = ["task", "idea", "note"] as const;
export type TaskKind = (typeof taskKinds)[number];

export const KIND_LABEL: Record<TaskKind, string> = {
  task: "Task",
  idea: "Idea",
  note: "Note",
};

/** Only tasks are schedulable — everything else is kept, not planned. */
export function isSchedulable(kind: TaskKind | null | undefined): boolean {
  return (kind ?? "task") === "task";
}

// v2 task model.
export const recurrenceFreqs = ["daily", "weekdays", "weekly", "monthly"] as const;
export type RecurrenceFreq = (typeof recurrenceFreqs)[number];

export type Subtask = {
  id: string;
  task_id: string;
  title: string;
  done: boolean;
  position: number;
};

export const subtaskColumns = "id, task_id, title, done, position";

// The /parse output contract (CLAUDE.md §6) — validated defensively at the
// boundary even though the service already schema-constrains it.
export const parseSuggestionsSchema = z.object({
  is_task: z.boolean(),
  title: z.string(),
  estimated_minutes: z.number().int().min(1).nullable(),
  energy_tag: z.enum(energyTags).nullable(),
  deadline: z.string().nullable(),
  suggested_project: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  source: z.enum(["llm", "fallback"]),
});

export type ParseSuggestions = z.infer<typeof parseSuggestionsSchema>;

// A project — a lightweight bucket tasks can belong to (Phase 10 stream B).
export type Project = {
  id: string;
  name: string;
  color: string | null;
  archived: boolean;
  created_at: string;
};

export const projectColumns = "id, name, color, archived, created_at";

export type InboxTask = {
  id: string;
  title: string;
  status: "inbox" | "todo" | "scheduled" | "done" | "rolled";
  raw_text: string | null;
  estimated_minutes: number | null;
  energy_tag: EnergyTag | null;
  deadline: string | null;
  planned_date: string | null;
  project_id: string | null;
  parse_suggestions: ParseSuggestions | null;
  parsed_at: string | null;
  recurrence: RecurrenceFreq | null;
  remind_at: string | null;
  earliest_start: string | null;
  latest_end: string | null;
  kind: TaskKind;
  created_at: string;
};

export const inboxTaskColumns =
  "id, title, status, raw_text, estimated_minutes, energy_tag, deadline, planned_date, project_id, parse_suggestions, parsed_at, recurrence, remind_at, earliest_start, latest_end, kind, created_at";

// The day view's slice of a task (Phase 2 — manual day + Daily Big 3).
export type DayTask = {
  id: string;
  title: string;
  status: "inbox" | "todo" | "scheduled" | "done" | "rolled";
  estimated_minutes: number | null;
  energy_tag: EnergyTag | null;
  priority: number;
  deadline: string | null;
  planned_date: string | null;
  is_fixed: boolean;
  fixed_start: string | null;
  is_big3: boolean;
  // Bonus work for one particular day: never scheduled onto the timeline,
  // never rolled forward, never overdue (CLAUDE.md §7).
  is_optional: boolean;
  scheduled_start: string | null;
  scheduled_end: string | null;
  recurrence: RecurrenceFreq | null;
  // Per-task timing rules, "HH:MM:SS" local clock times. Hard limits for the
  // scheduler — unlike energy tags, which are only a preference.
  earliest_start: string | null;
  latest_end: string | null;
};

export const dayTaskColumns =
  "id, title, status, estimated_minutes, energy_tag, priority, deadline, planned_date, is_fixed, fixed_start, is_big3, is_optional, scheduled_start, scheduled_end, recurrence, earliest_start, latest_end";

// A recurring stretch of the day the scheduler must never place into.
export type BlockedWindow = {
  id: string;
  label: string;
  start_time: string; // "HH:MM:SS"
  end_time: string;
  days_of_week: number[]; // 0 = Sunday .. 6 = Saturday (JS Date#getDay)
};

export const blockedWindowColumns = "id, label, start_time, end_time, days_of_week";

// jsonb clock-string ranges per energy tag, e.g. {"deep":["09:00-12:00"]}.
// The client resolves these against its local day before calling /api/plan.
export type EnergyProfile = Partial<Record<EnergyTag, string[]>>;

export type DayProfile = {
  timezone: string;
  working_hours_start: string; // "HH:MM:SS"
  working_hours_end: string;
  default_buffer_minutes: number;
  energy_profile: EnergyProfile | null;
  // Daily ceilings so the day can't be stuffed. null = no cap. The Big 3 are
  // exempt by design — a cap protects the rest of the day.
  max_deep_minutes: number | null;
  max_scheduled_minutes: number | null;
};

export const dayProfileColumns =
  "timezone, working_hours_start, working_hours_end, default_buffer_minutes, energy_profile, max_deep_minutes, max_scheduled_minutes";

// What /api/plan returns on success (Phase 3 — auto-schedule + re-flow).
export type PlanWildcard = { start: string; end: string };

export type PlanResponse = {
  tasks: DayTask[];
  wildcards: PlanWildcard[];
  overflow: string[];
  // Phase 5: per-energy-tag estimate correction applied to this plan, from
  // the user's own history. Only present when a tag was actually padded
  // (factor > 1) — surfaced transparently, never silently.
  padding?: Partial<Record<EnergyTag, number>>;
};

// Phase 5: one dot of the momentum strip. No row for a day = quiet absence;
// active=true = showed up; an explicit active=false row = a chosen rest day
// (deliberate, not a miss — it dims differently and doesn't count against).
export type MomentumDay = {
  metric_date: string; // YYYY-MM-DD
  active: boolean;
};
