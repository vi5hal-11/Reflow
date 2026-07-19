import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  dayTaskColumns,
  energyTags,
  type DayTask,
  type PlanResponse,
} from "@/lib/types";

const DEFAULT_TASK_MINUTES = 30;
const DEFAULT_FIXED_MINUTES = 60;

// All datetimes crossing this boundary are timezone-aware ISO strings.
const isoDatetime = z.iso.datetime({ offset: true });

// The client owns local-day math (browser-local day, see DECISIONS.md): it
// sends the concrete working window and energy windows already resolved
// against its local day. The BFF owns data loading and persistence.
const bodySchema = z.object({
  date: z.iso.date(),
  workingWindowStart: isoDatetime,
  workingWindowEnd: isoDatetime,
  energyWindows: z.array(
    z.object({
      tag: z.enum(energyTags),
      start: isoDatetime,
      end: isoDatetime,
    }),
  ),
});

// The deterministic scheduler's response (services/scheduler/app/models.py).
// Validated defensively — never trust another service blindly.
const scheduleResponseSchema = z.object({
  placed: z.array(
    z.object({
      task_id: z.string(),
      start: isoDatetime,
      end: isoDatetime,
      kept: z.boolean(),
    }),
  ),
  wildcards: z.array(z.object({ start: isoDatetime, end: isoDatetime })),
  overflow: z.array(z.string()),
});

type PlanTask = DayTask & { created_at: string };

function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

function sameInstant(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return new Date(a).getTime() === new Date(b).getTime();
}

const degraded = () => NextResponse.json({ degraded: true }, { status: 503 });

// Deterministic auto-schedule / re-flow (CLAUDE.md §5). The scheduler service
// does the placement; this route only feeds it and persists the outcome.
// Graceful degradation (§3): any scheduler trouble → 503 { degraded: true },
// and the app keeps working with manual placement.
export async function POST(request: Request) {
  const parsedBody = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const { date, workingWindowStart, workingWindowEnd, energyWindows } = parsedBody.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const schedulerUrl = process.env.SCHEDULER_URL;
  if (!schedulerUrl) return degraded();

  // The day's tasks: today's tray (todo), current placements (scheduled/done
  // in the window), and fixed appointments in the window.
  const [{ data: profile }, { data: taskRows, error: tasksError }, { data: events }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("default_buffer_minutes")
        .eq("id", user.id)
        .single(),
      supabase
        .from("tasks")
        .select(`${dayTaskColumns}, created_at`)
        .neq("status", "inbox")
        .or(
          [
            `and(status.eq.todo,planned_date.eq.${date})`,
            `and(status.in.(scheduled,done),scheduled_start.gte.${workingWindowStart},scheduled_start.lte.${workingWindowEnd})`,
            `and(is_fixed.eq.true,fixed_start.gte.${workingWindowStart},fixed_start.lte.${workingWindowEnd})`,
          ].join(","),
        )
        .order("created_at", { ascending: true }),
      supabase
        .from("calendar_events")
        .select("id, title, start, end, is_busy")
        .eq("is_busy", true)
        .gte("start", workingWindowStart)
        .lte("start", workingWindowEnd),
    ]);
  if (tasksError) return degraded();

  const tasks = (taskRows ?? []) as PlanTask[];

  // Fixed blocks are immovable: undone fixed tasks + busy calendar events.
  // Done tasks are finished — not rescheduled, and their old blocks aren't busy.
  const fixedBlocks = [
    ...tasks
      .filter((t) => t.is_fixed && t.fixed_start && t.status !== "done")
      .map((t) => ({
        id: t.id,
        title: t.title,
        start: t.fixed_start!,
        end: addMinutes(t.fixed_start!, t.estimated_minutes ?? DEFAULT_FIXED_MINUTES),
      })),
    ...(events ?? []).map((e) => ({
      id: `event-${e.id}`,
      title: (e.title as string | null) ?? "Busy",
      start: e.start as string,
      end: e.end as string,
    })),
  ];

  // Flexible = today's todos + still-pending scheduled tasks, carrying their
  // current placement so the engine can keep still-valid blocks (stable re-flow).
  const flexibleTasks = tasks
    .filter((t) => !t.is_fixed && (t.status === "todo" || t.status === "scheduled"))
    .map((t) => ({
      id: t.id,
      title: t.title,
      estimated_minutes: t.estimated_minutes ?? DEFAULT_TASK_MINUTES,
      energy_tag: t.energy_tag,
      priority: t.priority ?? 2,
      deadline: t.deadline,
      is_big3: t.is_big3,
      scheduled_start: t.scheduled_start,
      scheduled_end: t.scheduled_end,
      created_at: t.created_at,
    }));

  let result: z.infer<typeof scheduleResponseSchema>;
  try {
    const res = await fetch(`${schedulerUrl}/schedule`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(3_000),
      body: JSON.stringify({
        now: new Date().toISOString(),
        working_window_start: workingWindowStart,
        working_window_end: workingWindowEnd,
        fixed_blocks: fixedBlocks,
        flexible_tasks: flexibleTasks,
        energy_windows: energyWindows,
        default_buffer_minutes: profile?.default_buffer_minutes ?? 10,
      }),
    });
    if (!res.ok) return degraded();
    result = scheduleResponseSchema.parse(await res.json());
  } catch {
    return degraded();
  }

  // Persist the outcome, skipping writes for kept placements that didn't move.
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const updates: { id: string; patch: Partial<DayTask> }[] = [];

  for (const block of result.placed) {
    const task = byId.get(block.task_id);
    if (!task) continue;
    const unchanged =
      block.kept &&
      task.status === "scheduled" &&
      sameInstant(task.scheduled_start, block.start) &&
      sameInstant(task.scheduled_end, block.end);
    const patch = {
      status: "scheduled" as const,
      scheduled_start: block.start,
      scheduled_end: block.end,
    };
    Object.assign(task, patch);
    if (!unchanged) updates.push({ id: task.id, patch });
  }

  // Overflow isn't failure (§5.5): back to the tray, gently, still on today.
  for (const id of result.overflow) {
    const task = byId.get(id);
    if (!task) continue;
    const patch = {
      status: "todo" as const,
      scheduled_start: null,
      scheduled_end: null,
      planned_date: date,
    };
    const unchanged =
      task.status === "todo" &&
      task.scheduled_start === null &&
      task.scheduled_end === null &&
      task.planned_date === date;
    Object.assign(task, patch);
    if (!unchanged) updates.push({ id, patch });
  }

  if (updates.length > 0) {
    const results = await Promise.all(
      updates.map((u) => supabase.from("tasks").update(u.patch).eq("id", u.id)),
    );
    // If persistence failed, don't report a plan the DB doesn't reflect.
    if (results.some((r) => r.error)) return degraded();
  }

  const responseTasks: DayTask[] = tasks.map((t) => {
    const { created_at: _createdAt, ...day } = t;
    void _createdAt;
    return day;
  });

  const response: PlanResponse = {
    tasks: responseTasks,
    wildcards: result.wildcards,
    overflow: result.overflow,
  };
  return NextResponse.json(response);
}
