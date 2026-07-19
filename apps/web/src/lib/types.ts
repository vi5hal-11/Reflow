import { z } from "zod";

export const energyTags = ["deep", "shallow", "admin"] as const;
export type EnergyTag = (typeof energyTags)[number];

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

export type InboxTask = {
  id: string;
  title: string;
  status: "inbox" | "todo" | "scheduled" | "done" | "rolled";
  raw_text: string | null;
  estimated_minutes: number | null;
  energy_tag: EnergyTag | null;
  deadline: string | null;
  planned_date: string | null;
  parse_suggestions: ParseSuggestions | null;
  parsed_at: string | null;
  created_at: string;
};

export const inboxTaskColumns =
  "id, title, status, raw_text, estimated_minutes, energy_tag, deadline, planned_date, parse_suggestions, parsed_at, created_at";

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
  scheduled_start: string | null;
  scheduled_end: string | null;
};

export const dayTaskColumns =
  "id, title, status, estimated_minutes, energy_tag, priority, deadline, planned_date, is_fixed, fixed_start, is_big3, scheduled_start, scheduled_end";

export type DayCalendarEvent = {
  id: string;
  title: string | null;
  start: string;
  end: string;
  is_busy: boolean;
};

export type DayProfile = {
  timezone: string;
  working_hours_start: string; // "HH:MM:SS"
  working_hours_end: string;
  default_buffer_minutes: number;
};
