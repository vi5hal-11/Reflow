import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  blockedWindowColumns,
  dayTaskColumns,
  energyTags,
  type BlockedWindow,
  type DayTask,
  type EnergyTag,
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
  // Date#getTimezoneOffset() from the browser. Lets the BFF resolve stored
  // clock times (blocked windows, per-task rules) against the user's local day
  // without duplicating day math on the client.
  utcOffsetMinutes: z.number().int().min(-840).max(840).default(0),
});

/** A stored "HH:MM[:SS]" local clock time → an instant on the plan's local day. */
function localTimeToIso(date: string, time: string, offsetMinutes: number): string {
  const hms = time.length === 5 ? `${time}:00` : time;
  const asUtc = Date.parse(`${date}T${hms}Z`);
  if (Number.isNaN(asUtc)) return "";
  // getTimezoneOffset() is minutes to ADD to local to reach UTC.
  return new Date(asUtc + offsetMinutes * 60_000).toISOString();
}

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
  const { date, workingWindowStart, workingWindowEnd, energyWindows, utcOffsetMinutes } =
    parsedBody.data;

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
  const [
    { data: profile },
    { data: taskRows, error: tasksError },
    { data: blockedRows },
  ] = await Promise.all([
      supabase
        .from("profiles")
        .select("default_buffer_minutes, max_deep_minutes, max_scheduled_minutes")
        .eq("id", user.id)
        .single(),
      supabase
        .from("tasks")
        .select(`${dayTaskColumns}, created_at`)
        .neq("status", "inbox")
        // Optional tasks are bonus: the scheduler never places them, so they
        // can't crowd out required work or create overflow pressure.
        .eq("is_optional", false)
        // Ideas and notes are kept, not planned — they never reach the engine.
        .eq("kind", "task")
        .or(
          [
            `and(status.in.(todo,rolled),planned_date.eq.${date})`,
            `and(status.in.(scheduled,done),scheduled_start.gte.${workingWindowStart},scheduled_start.lte.${workingWindowEnd})`,
            `and(is_fixed.eq.true,fixed_start.gte.${workingWindowStart},fixed_start.lte.${workingWindowEnd})`,
          ].join(","),
        )
        .order("created_at", { ascending: true }),
      supabase.from("blocked_windows").select(blockedWindowColumns),
    ]);
  if (tasksError) return degraded();

  const tasks = (taskRows ?? []) as PlanTask[];

  // Blocked windows recurring on this weekday become ordinary fixed blocks, so
  // the engine needs no concept of recurrence — it simply can't place there.
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const blockedBlocks = ((blockedRows ?? []) as BlockedWindow[])
    .filter((w) => w.days_of_week?.includes(weekday))
    .map((w) => ({
      id: `blocked-${w.id}`,
      title: w.label,
      start: localTimeToIso(date, w.start_time, utcOffsetMinutes),
      end: localTimeToIso(date, w.end_time, utcOffsetMinutes),
    }))
    .filter((b) => b.start && b.end && b.start < b.end);

  // Fixed blocks are immovable: undone fixed appointments. Done tasks are
  // finished — not rescheduled, and their old blocks aren't busy.
  const fixedBlocks = [
    ...tasks
      .filter((t) => t.is_fixed && t.fixed_start && t.status !== "done")
      .map((t) => ({
        id: t.id,
        title: t.title,
        start: t.fixed_start!,
        end: addMinutes(t.fixed_start!, t.estimated_minutes ?? DEFAULT_FIXED_MINUTES),
      })),
    ...blockedBlocks,
  ];

  // Phase 5 estimate learning: people chronically under-estimate. Derive a
  // per-energy-tag correction factor from the user's own history (mean
  // actual/estimated over recent completions, only ever padding up, capped
  // at 2×) and stretch estimates before the engine sees them. Surfaced in
  // the response — padding is transparent, never silent.
  const { data: history } = await supabase
    .from("estimate_history")
    .select("energy_tag, estimated_minutes, actual_minutes")
    .order("created_at", { ascending: false })
    .limit(60);
  const padding: Partial<Record<EnergyTag, number>> = {};
  for (const tag of energyTags) {
    const ratios = (history ?? [])
      .filter((h) => h.energy_tag === tag && h.estimated_minutes > 0)
      .map((h) => h.actual_minutes / h.estimated_minutes);
    if (ratios.length < 3) continue; // not enough signal to pad honestly
    const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    const factor = Math.min(2, Math.max(1, mean));
    if (factor > 1.05) padding[tag] = Math.round(factor * 100) / 100;
  }
  const padded = (t: PlanTask): number => {
    const base = t.estimated_minutes ?? DEFAULT_TASK_MINUTES;
    const factor = t.energy_tag ? (padding[t.energy_tag] ?? 1) : 1;
    return Math.round(base * factor);
  };

  // Flexible = today's todos (rolled ones included — they re-flow like any
  // other) + still-pending scheduled tasks, carrying their current placement
  // so the engine can keep still-valid blocks (stable re-flow).
  const flexibleTasks = tasks
    .filter(
      (t) =>
        !t.is_fixed &&
        (t.status === "todo" || t.status === "rolled" || t.status === "scheduled"),
    )
    .map((t) => ({
      id: t.id,
      title: t.title,
      estimated_minutes: padded(t),
      energy_tag: t.energy_tag,
      priority: t.priority ?? 2,
      deadline: t.deadline,
      is_big3: t.is_big3,
      scheduled_start: t.scheduled_start,
      scheduled_end: t.scheduled_end,
      created_at: t.created_at,
      // Hard per-task limits, resolved against this local day.
      earliest_start: t.earliest_start
        ? localTimeToIso(date, t.earliest_start, utcOffsetMinutes) || null
        : null,
      latest_end: t.latest_end
        ? localTimeToIso(date, t.latest_end, utcOffsetMinutes) || null
        : null,
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
        // null = uncapped, which is the default for everyone.
        max_deep_minutes: profile?.max_deep_minutes ?? null,
        max_scheduled_minutes: profile?.max_scheduled_minutes ?? null,
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
    if (!unchanged) {
      updates.push({ id: task.id, patch });
    }
    Object.assign(task, patch);
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
    ...(Object.keys(padding).length > 0 ? { padding } : {}),
  };
  return NextResponse.json(response);
}
