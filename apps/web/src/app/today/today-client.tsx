"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  energyTags,
  type DayCalendarEvent,
  type DayProfile,
  type DayTask,
  type PlanResponse,
  type PlanWildcard,
} from "@/lib/types";

const PX_PER_MIN = 1.1;
const MIN_GAP_MINUTES = 10;
const DEFAULT_TASK_MINUTES = 30;
const DEFAULT_FIXED_MINUTES = 60;

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function localToday(): string {
  return fmtDate(new Date());
}

function localTomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return fmtDate(d);
}

/** Minutes since local midnight for an ISO timestamp. */
function toMinutes(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

function isLocalToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/** "HH:MM[:SS]" → minutes since midnight. */
function parseClock(clock: string): number {
  const [h, m] = clock.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minutesToIso(minutes: number): string {
  const d = new Date();
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return d.toISOString();
}

function fmtClock(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2, "0")}${ampm}`;
}

type Interval = { start: number; end: number };

function subtractIntervals(window: Interval, busy: Interval[]): Interval[] {
  const sorted = busy
    .filter((b) => b.end > window.start && b.start < window.end)
    .sort((a, b) => a.start - b.start);
  const gaps: Interval[] = [];
  let cursor = window.start;
  for (const b of sorted) {
    if (b.start > cursor) gaps.push({ start: cursor, end: b.start });
    cursor = Math.max(cursor, b.end);
    if (cursor >= window.end) break;
  }
  if (cursor < window.end) gaps.push({ start: cursor, end: window.end });
  return gaps.filter((g) => g.end - g.start >= MIN_GAP_MINUTES);
}

function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

export function TodayClient({
  userId,
  profile,
  initialTasks,
  calendarEvents,
  initialBig3Ids,
}: {
  userId: string;
  profile: DayProfile;
  initialTasks: DayTask[];
  calendarEvents: DayCalendarEvent[];
  initialBig3Ids: string[];
}) {
  const supabase = createClient();
  const today = localToday();
  const [tasks, setTasks] = useState<DayTask[]>(initialTasks);
  const [big3Ids, setBig3Ids] = useState<string[]>(initialBig3Ids);
  const [placingId, setPlacingId] = useState<string | null>(null);
  const [now, setNow] = useState(nowMinutes);
  const [wildcards, setWildcards] = useState<PlanWildcard[]>([]);
  const [overflowIds, setOverflowIds] = useState<Set<string>>(new Set());
  const [planning, setPlanning] = useState(false);
  const [planNotice, setPlanNotice] = useState<string | null>(null);
  // Auto re-flow only after the user has planned once, at most once a minute.
  const hasPlannedRef = useRef(false);
  const lastReflowRef = useRef(0);

  useEffect(() => {
    const t = setInterval(() => setNow(nowMinutes()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Self-healing timezone: planned_date and day math are browser-local, so
  // keep the profile's timezone in sync for server-side rendering and Phase 3.
  useEffect(() => {
    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (browserTz && browserTz !== profile.timezone) {
      void supabase.from("profiles").update({ timezone: browserTz }).eq("id", userId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patchTask = useCallback((id: string, patch: Partial<DayTask>) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const dayStart = parseClock(profile.working_hours_start);
  const dayEnd = Math.max(parseClock(profile.working_hours_end), dayStart + 60);

  // "Plan my day" + silent self-healing re-flow (§5). The deterministic
  // scheduler service does the placement; this only ships it the local-day
  // window and merges the outcome. Failures never block manual placement.
  const energyProfileJson = JSON.stringify(profile.energy_profile ?? {});
  const planDay = useCallback(
    async (auto: boolean) => {
      if (auto) {
        if (!hasPlannedRef.current) return;
        if (Date.now() - lastReflowRef.current < 60_000) return;
      }
      lastReflowRef.current = Date.now();
      setPlanning(true);
      if (!auto) setPlanNotice(null);
      try {
        const energyProfile = JSON.parse(energyProfileJson) as Partial<
          Record<string, string[]>
        >;
        const energyWindows = energyTags.flatMap((tag) =>
          (energyProfile[tag] ?? []).flatMap((range) => {
            const [from, to] = range.split("-");
            if (!from || !to) return [];
            return [
              {
                tag,
                start: minutesToIso(parseClock(from)),
                end: minutesToIso(parseClock(to)),
              },
            ];
          }),
        );
        const res = await fetch("/api/plan", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            date: localToday(),
            workingWindowStart: minutesToIso(dayStart),
            workingWindowEnd: minutesToIso(dayEnd),
            energyWindows,
          }),
        });
        if (!res.ok) {
          if (!auto)
            setPlanNotice(
              "The planner isn't reachable right now — placing by hand works as always.",
            );
          return;
        }
        const data = (await res.json()) as PlanResponse;
        hasPlannedRef.current = true;
        setTasks((prev) => {
          const updated = new Map(data.tasks.map((t) => [t.id, t]));
          const merged = prev.map((t) => updated.get(t.id) ?? t);
          const known = new Set(prev.map((t) => t.id));
          for (const t of data.tasks) if (!known.has(t.id)) merged.push(t);
          return merged;
        });
        setWildcards(data.wildcards);
        setOverflowIds(new Set(data.overflow));
        setPlacingId(null);
      } catch {
        if (!auto)
          setPlanNotice(
            "The planner isn't reachable right now — placing by hand works as always.",
          );
      } finally {
        setPlanning(false);
      }
    },
    [dayStart, dayEnd, energyProfileJson],
  );

  // Re-flow when the day changes shape: completions, edits, returning to
  // the tab. Throttled and silent — the plan heals without ceremony.
  useEffect(() => {
    const onFocus = () => void planDay(true);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [planDay]);

  const fixedBlocks = useMemo(() => {
    const taskBlocks = tasks
      .filter((t) => t.is_fixed && t.fixed_start && isLocalToday(t.fixed_start))
      .map((t) => ({
        key: `task-${t.id}`,
        task: t as DayTask | null,
        title: t.title,
        start: toMinutes(t.fixed_start!),
        end: toMinutes(t.fixed_start!) + (t.estimated_minutes ?? DEFAULT_FIXED_MINUTES),
      }));
    const eventBlocks = calendarEvents
      .filter((e) => e.is_busy && isLocalToday(e.start))
      .map((e) => ({
        key: `event-${e.id}`,
        task: null as DayTask | null,
        title: e.title ?? "Busy",
        start: toMinutes(e.start),
        end: Math.max(toMinutes(e.end), toMinutes(e.start) + 15),
      }));
    return [...taskBlocks, ...eventBlocks];
  }, [tasks, calendarEvents]);

  const placed = useMemo(
    () =>
      tasks.filter(
        (t) =>
          !t.is_fixed &&
          (t.status === "scheduled" || t.status === "done") &&
          t.scheduled_start &&
          isLocalToday(t.scheduled_start),
      ),
    [tasks],
  );

  const tray = useMemo(
    () =>
      tasks.filter(
        (t) => !t.is_fixed && t.status === "todo" && t.planned_date === today,
      ),
    [tasks, today],
  );

  const doneUnplaced = useMemo(
    () =>
      tasks.filter(
        (t) =>
          !t.is_fixed &&
          t.status === "done" &&
          !t.scheduled_start &&
          t.planned_date === today,
      ),
    [tasks, today],
  );

  const gaps = useMemo(() => {
    const busy: Interval[] = [
      ...fixedBlocks.map((b) => ({ start: b.start, end: b.end })),
      ...placed.map((t) => ({
        start: toMinutes(t.scheduled_start!),
        end: t.scheduled_end
          ? toMinutes(t.scheduled_end)
          : toMinutes(t.scheduled_start!) + DEFAULT_TASK_MINUTES,
      })),
    ];
    return subtractIntervals({ start: dayStart, end: dayEnd }, busy);
  }, [fixedBlocks, placed, dayStart, dayEnd]);

  const placingTask = placingId ? tasks.find((t) => t.id === placingId) : null;
  const placingMinutes = placingTask
    ? (placingTask.estimated_minutes ?? DEFAULT_TASK_MINUTES)
    : 0;

  /** Where the task would land in this gap, or null if it doesn't fit. */
  const fitInGap = useCallback(
    (gap: Interval): number | null => {
      if (!placingTask) return null;
      const start = Math.max(gap.start, Math.ceil(now / 5) * 5);
      const roundedStart = Math.ceil(start / 5) * 5;
      const usable = gap.end - roundedStart;
      if (usable < placingMinutes) {
        // A past-only gap or one too small once clamped to now.
        return gap.start >= now && gap.end - gap.start >= placingMinutes ? gap.start : null;
      }
      return roundedStart;
    },
    [placingTask, placingMinutes, now],
  );

  const place = useCallback(
    async (task: DayTask, startMinutes: number) => {
      const minutes = task.estimated_minutes ?? DEFAULT_TASK_MINUTES;
      const scheduled_start = minutesToIso(startMinutes);
      const scheduled_end = minutesToIso(startMinutes + minutes);
      setPlacingId(null);
      patchTask(task.id, { status: "scheduled", scheduled_start, scheduled_end });
      const { error } = await supabase
        .from("tasks")
        .update({ status: "scheduled", scheduled_start, scheduled_end })
        .eq("id", task.id);
      if (error)
        patchTask(task.id, {
          status: "todo",
          scheduled_start: null,
          scheduled_end: null,
        });
      else void planDay(true);
    },
    [supabase, patchTask, planDay],
  );

  const unschedule = useCallback(
    async (task: DayTask) => {
      const prev = { ...task };
      patchTask(task.id, {
        status: "todo",
        scheduled_start: null,
        scheduled_end: null,
      });
      const { error } = await supabase
        .from("tasks")
        .update({ status: "todo", scheduled_start: null, scheduled_end: null })
        .eq("id", task.id);
      if (error) patchTask(task.id, prev);
    },
    [supabase, patchTask],
  );

  const toggleDone = useCallback(
    async (task: DayTask) => {
      const wasDone = task.status === "done";
      const nextStatus = wasDone
        ? task.scheduled_start
          ? "scheduled"
          : "todo"
        : "done";
      patchTask(task.id, { status: nextStatus });
      const { error } = await supabase
        .from("tasks")
        .update({ status: nextStatus })
        .eq("id", task.id);
      if (error) patchTask(task.id, { status: task.status });
      else void planDay(true);
    },
    [supabase, patchTask, planDay],
  );

  const moveToLater = useCallback(
    async (task: DayTask) => {
      const prev = { ...task };
      const nextIds = big3Ids.filter((id) => id !== task.id);
      patchTask(task.id, { planned_date: null });
      setBig3Ids(nextIds);
      const { error: taskError } = await supabase
        .from("tasks")
        .update({ planned_date: null, is_big3: false })
        .eq("id", task.id);
      const { error: planError } =
        nextIds.length !== big3Ids.length
          ? await supabase
              .from("daily_plans")
              .upsert(
                { user_id: userId, plan_date: today, big3_task_ids: nextIds },
                { onConflict: "user_id,plan_date" },
              )
          : { error: null };
      if (taskError || planError) {
        patchTask(task.id, prev);
        setBig3Ids(big3Ids);
      }
    },
    [supabase, patchTask, big3Ids, userId, today],
  );

  const moveToTomorrow = useCallback(
    async (task: DayTask) => {
      const prev = { ...task };
      const nextIds = big3Ids.filter((id) => id !== task.id);
      patchTask(task.id, { planned_date: localTomorrow() });
      setOverflowIds((ids) => {
        const next = new Set(ids);
        next.delete(task.id);
        return next;
      });
      setBig3Ids(nextIds);
      const { error: taskError } = await supabase
        .from("tasks")
        .update({ planned_date: localTomorrow(), is_big3: false })
        .eq("id", task.id);
      const { error: planError } =
        nextIds.length !== big3Ids.length
          ? await supabase
              .from("daily_plans")
              .upsert(
                { user_id: userId, plan_date: today, big3_task_ids: nextIds },
                { onConflict: "user_id,plan_date" },
              )
          : { error: null };
      if (taskError || planError) {
        patchTask(task.id, prev);
        setBig3Ids(big3Ids);
      }
    },
    [supabase, patchTask, big3Ids, userId, today],
  );

  const toggleBig3 = useCallback(
    async (task: DayTask) => {
      const isIn = big3Ids.includes(task.id);
      if (!isIn && big3Ids.length >= 3) return;
      const nextIds = isIn
        ? big3Ids.filter((id) => id !== task.id)
        : [...big3Ids, task.id];
      setBig3Ids(nextIds);
      patchTask(task.id, { is_big3: !isIn });
      const [{ error: taskError }, { error: planError }] = await Promise.all([
        supabase.from("tasks").update({ is_big3: !isIn }).eq("id", task.id),
        supabase
          .from("daily_plans")
          .upsert(
            { user_id: userId, plan_date: today, big3_task_ids: nextIds },
            { onConflict: "user_id,plan_date" },
          ),
      ]);
      if (taskError || planError) {
        setBig3Ids(big3Ids);
        patchTask(task.id, { is_big3: isIn });
      }
    },
    [supabase, big3Ids, patchTask, userId, today],
  );

  const big3 = big3Ids
    .map((id) => tasks.find((t) => t.id === id))
    .filter((t): t is DayTask => Boolean(t));
  const big3Done = big3.length > 0 && big3.every((t) => t.status === "done");

  const timelineHeight = (dayEnd - dayStart) * PX_PER_MIN;
  const hourMarks: number[] = [];
  for (let m = Math.ceil(dayStart / 60) * 60; m <= dayEnd; m += 60) hourMarks.push(m);

  const y = (minutes: number) => (minutes - dayStart) * PX_PER_MIN;

  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  function star(task: DayTask, extraClass?: string) {
    const isIn = big3Ids.includes(task.id);
    const full = !isIn && big3Ids.length >= 3;
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          void toggleBig3(task);
        }}
        disabled={full}
        aria-label={isIn ? "Remove from Big 3" : "Add to Big 3"}
        title={full ? "Big 3 is full" : isIn ? "Remove from Big 3" : "Add to Big 3"}
        className={cn(
          "px-1 text-sm",
          isIn ? "text-amber-500" : "text-neutral-300 hover:text-amber-400 dark:text-neutral-600",
          full && "cursor-default opacity-40 hover:text-neutral-300",
          extraClass,
        )}
      >
        {isIn ? "★" : "☆"}
      </button>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="flex items-baseline justify-between">
        <div>
          <span className="text-sm text-neutral-400">Reflow</span>
          <h1 className="text-2xl font-medium tracking-tight">{dateLabel}</h1>
        </div>
        <nav className="flex items-center gap-4 text-sm text-neutral-400">
          <Link href="/inbox" className="underline underline-offset-4 hover:text-neutral-600">
            Inbox
          </Link>
          <button
            onClick={() => void planDay(false)}
            disabled={planning}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
          >
            {planning ? "re-flowing…" : "Plan my day"}
          </button>
        </nav>
      </header>

      {planNotice && (
        <p className="rounded-lg border border-neutral-200 px-4 py-2 text-sm text-neutral-500 dark:border-neutral-800">
          {planNotice}
        </p>
      )}

      {/* Daily Big 3 — the day's definition of a win */}
      <section aria-label="Daily Big 3" className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-neutral-500">Big 3</h2>
          <span className="text-xs text-neutral-400">
            {big3.length === 0
              ? "star up to three tasks that would make today a win"
              : `${big3.filter((t) => t.status === "done").length} of ${big3.length} done`}
          </span>
        </div>
        {big3Done ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            That&apos;s a win. Your Big 3 are done — everything else today is a bonus.
          </div>
        ) : null}
        {big3.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {big3.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800"
              >
                <button
                  onClick={() => void toggleDone(t)}
                  aria-label={t.status === "done" ? "Mark not done" : "Mark done"}
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px]",
                    t.status === "done"
                      ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                      : "border-neutral-300 dark:border-neutral-600",
                  )}
                >
                  {t.status === "done" ? "✓" : ""}
                </button>
                <span className={cn("truncate", t.status === "done" && "text-neutral-400 line-through")}>
                  {t.title}
                </span>
                {star(t, "ml-auto")}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-8 sm:grid-cols-[1fr_240px]">
        {/* Timeline */}
        <section aria-label="Timeline">
          <div
            className="relative"
            style={{ height: `${timelineHeight}px` }}
          >
            {hourMarks.map((m) => (
              <div
                key={m}
                className="absolute left-0 right-0 border-t border-neutral-100 dark:border-neutral-900"
                style={{ top: `${y(m)}px` }}
              >
                <span className="absolute -top-2 left-0 w-12 text-[11px] text-neutral-300 dark:text-neutral-600">
                  {fmtClock(m)}
                </span>
              </div>
            ))}

            {/* Free gaps — open space is a feature */}
            {gaps.map((g) => {
              const fitStart = fitInGap(g);
              const clickable = placingTask && fitStart !== null;
              return (
                <div
                  key={`gap-${g.start}`}
                  onClick={() => {
                    if (clickable && placingTask) void place(placingTask, fitStart!);
                  }}
                  className={cn(
                    "absolute left-14 right-0 rounded-md border border-dashed",
                    clickable
                      ? "cursor-pointer border-neutral-400 bg-neutral-50 dark:border-neutral-500 dark:bg-neutral-900"
                      : "border-transparent",
                  )}
                  style={{ top: `${y(g.start)}px`, height: `${(g.end - g.start) * PX_PER_MIN}px` }}
                >
                  {clickable && (
                    <span className="absolute inset-0 flex items-center justify-center text-xs text-neutral-500">
                      place at {fmtClock(fitStart!)}
                    </span>
                  )}
                </div>
              );
            })}

            {/* Wildcard blocks — reserved breathing room (§5.6). Click-through
                so a gap underneath stays manually placeable: the human wins. */}
            {wildcards
              .filter((w) => isLocalToday(w.start))
              .map((w) => {
                const start = toMinutes(w.start);
                const end = toMinutes(w.end);
                return (
                  <div
                    key={`wc-${w.start}`}
                    aria-hidden
                    className="pointer-events-none absolute left-14 right-0 overflow-hidden rounded-md border border-dashed border-amber-300/70 bg-amber-50/40 px-3 py-1 dark:border-amber-700/40 dark:bg-amber-950/20"
                    style={{
                      top: `${y(Math.max(start, dayStart))}px`,
                      height: `${Math.max((Math.min(end, dayEnd) - Math.max(start, dayStart)) * PX_PER_MIN, 20)}px`,
                    }}
                  >
                    <p className="truncate text-[11px] text-amber-600/80 dark:text-amber-400/70">
                      wildcard · breathing room
                    </p>
                  </div>
                );
              })}

            {/* Fixed blocks — immovable */}
            {fixedBlocks.map((b) => (
              <div
                key={b.key}
                className="absolute left-14 right-0 overflow-hidden rounded-md border border-neutral-300 bg-neutral-100 px-3 py-1 dark:border-neutral-700 dark:bg-neutral-900"
                style={{
                  top: `${y(Math.max(b.start, dayStart))}px`,
                  height: `${Math.max((Math.min(b.end, dayEnd) - Math.max(b.start, dayStart)) * PX_PER_MIN, 20)}px`,
                }}
              >
                <p className="truncate text-xs font-medium text-neutral-600 dark:text-neutral-300">
                  {b.title}
                </p>
                <p className="text-[11px] text-neutral-400">
                  {fmtClock(b.start)}–{fmtClock(b.end)} · fixed
                </p>
              </div>
            ))}

            {/* Placed flexible tasks */}
            {placed.map((t) => {
              const start = toMinutes(t.scheduled_start!);
              const end = t.scheduled_end
                ? toMinutes(t.scheduled_end)
                : start + DEFAULT_TASK_MINUTES;
              const done = t.status === "done";
              return (
                <div
                  key={t.id}
                  className={cn(
                    "group absolute left-14 right-0 overflow-hidden rounded-md border px-3 py-1",
                    done
                      ? "border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950"
                      : "border-neutral-900 bg-white shadow-sm dark:border-neutral-100 dark:bg-neutral-900",
                  )}
                  style={{
                    top: `${y(Math.max(start, dayStart))}px`,
                    height: `${Math.max((Math.min(end, dayEnd) - Math.max(start, dayStart)) * PX_PER_MIN, 24)}px`,
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className={cn(
                        "truncate text-xs font-medium",
                        done && "text-neutral-400 line-through",
                      )}
                    >
                      {big3Ids.includes(t.id) && <span className="text-amber-500">★ </span>}
                      {t.title}
                    </p>
                    <div className="flex shrink-0 gap-1 text-[11px] opacity-0 group-hover:opacity-100">
                      <button
                        onClick={() => void toggleDone(t)}
                        className="rounded border border-neutral-300 px-1.5 hover:border-neutral-500 dark:border-neutral-600"
                      >
                        {done ? "undo" : "done"}
                      </button>
                      {!done && (
                        <button
                          onClick={() => void unschedule(t)}
                          title="Back to the tray — no harm done"
                          className="rounded border border-neutral-300 px-1.5 text-neutral-400 hover:border-neutral-500 dark:border-neutral-600"
                        >
                          unplace
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-[11px] text-neutral-400">
                    {fmtClock(start)}–{fmtClock(end)}
                    {t.energy_tag ? ` · ${t.energy_tag}` : ""}
                  </p>
                </div>
              );
            })}

            {/* Now line */}
            {now >= dayStart && now <= dayEnd && (
              <div
                aria-hidden
                className="pointer-events-none absolute left-10 right-0 border-t border-amber-400"
                style={{ top: `${y(now)}px` }}
              >
                <span className="absolute -top-2 -left-10 text-[10px] text-amber-500">now</span>
              </div>
            )}
          </div>
        </section>

        {/* Tray — today's tasks awaiting a slot */}
        <aside aria-label="To place" className="space-y-2">
          <h2 className="text-sm font-medium text-neutral-500">To place</h2>
          {tray.length === 0 ? (
            <p className="text-xs text-neutral-400">
              Nothing waiting. Triage the{" "}
              <Link href="/inbox" className="underline underline-offset-4">
                inbox
              </Link>{" "}
              to add tasks to today.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {tray.map((t) => (
                <li
                  key={t.id}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-sm",
                    placingId === t.id
                      ? "border-neutral-900 dark:border-neutral-100"
                      : "border-neutral-200 dark:border-neutral-800",
                  )}
                >
                  <div className="flex items-center gap-1">
                    <span className="min-w-0 flex-1 truncate">{t.title}</span>
                    {star(t)}
                  </div>
                  {overflowIds.has(t.id) && (
                    <p className="mt-1 text-[11px] text-neutral-400">
                      didn&apos;t fit today — it can wait, no harm done
                    </p>
                  )}
                  <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-neutral-400">
                    <span>{t.estimated_minutes ?? DEFAULT_TASK_MINUTES}m</span>
                    {t.energy_tag && <span>· {t.energy_tag}</span>}
                    <span className="ml-auto flex gap-1">
                      <button
                        onClick={() => setPlacingId(placingId === t.id ? null : t.id)}
                        className={cn(
                          "rounded border px-1.5 py-0.5",
                          placingId === t.id
                            ? "border-neutral-900 font-medium dark:border-neutral-100"
                            : "border-neutral-300 hover:border-neutral-500 dark:border-neutral-600",
                        )}
                      >
                        {placingId === t.id ? "pick a gap…" : "place"}
                      </button>
                      <button
                        onClick={() => void toggleDone(t)}
                        className="rounded border border-neutral-300 px-1.5 py-0.5 hover:border-neutral-500 dark:border-neutral-600"
                      >
                        done
                      </button>
                      <button
                        onClick={() => void moveToLater(t)}
                        title="Move to Later — it'll be there when you want it"
                        className="rounded border border-neutral-300 px-1.5 py-0.5 text-neutral-400 hover:border-neutral-500 dark:border-neutral-600"
                      >
                        later
                      </button>
                      {overflowIds.has(t.id) && (
                        <button
                          onClick={() => void moveToTomorrow(t)}
                          title="Roll to tomorrow — it'll be first in line"
                          className="rounded border border-neutral-300 px-1.5 py-0.5 text-neutral-400 hover:border-neutral-500 dark:border-neutral-600"
                        >
                          tomorrow
                        </button>
                      )}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {doneUnplaced.length > 0 && (
            <ul className="flex flex-col gap-1 pt-2">
              {doneUnplaced.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center gap-2 px-1 text-xs text-neutral-400"
                >
                  <span>✓</span>
                  <span className="truncate line-through">{t.title}</span>
                  <button
                    onClick={() => void toggleDone(t)}
                    className="ml-auto underline underline-offset-2"
                  >
                    undo
                  </button>
                </li>
              ))}
            </ul>
          )}

          {placingTask && (
            <p className="text-[11px] leading-relaxed text-neutral-400">
              Click a highlighted gap on the timeline to schedule{" "}
              <span className="font-medium text-neutral-500">{placingTask.title}</span> (
              {placingMinutes}m).{" "}
              <button className="underline underline-offset-2" onClick={() => setPlacingId(null)}>
                cancel
              </button>
            </p>
          )}
        </aside>
      </div>

      <p className="mt-auto pt-6 text-center text-xs text-neutral-300 dark:text-neutral-600">
        plan my day re-flows around what&apos;s fixed · placing by hand always works
      </p>
    </main>
  );
}
