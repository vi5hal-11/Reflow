"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { CommandBar } from "@/components/command/command-trigger";
import { ViewSwitcher } from "@/components/app-shell/view-switcher";
import { nextRecurringInsert } from "@/lib/recurrence";
import { Check } from "lucide-react";
import { ENERGY, EnergyDot } from "@/components/ui/energy";
import { Meter, Ring } from "@/components/ui/ring";
import { SunHorizon } from "@/components/ui/sun-horizon";
import type { CalendarStatus, CalendarSyncResult } from "@/lib/calendar/types";
import {
  energyTags,
  type DayCalendarEvent,
  type DayProfile,
  type DayTask,
  type EnergyTag,
  type MomentumDay,
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
  initialMomentum,
  calendarStatus,
}: {
  userId: string;
  profile: DayProfile;
  initialTasks: DayTask[];
  calendarEvents: DayCalendarEvent[];
  initialBig3Ids: string[];
  initialMomentum: MomentumDay[];
  calendarStatus: CalendarStatus;
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
  const [padding, setPadding] = useState<Partial<Record<EnergyTag, number>>>({});
  const [momentum, setMomentum] = useState<MomentumDay[]>(initialMomentum);
  const [reflection, setReflection] = useState<{
    insight: string;
    pattern: string | null;
    encouragement: string;
  } | null>(null);
  const [reflecting, setReflecting] = useState(false);
  const [reflectNotice, setReflectNotice] = useState<string | null>(null);
  // Calendar events live in state so a sync can replace them; the server
  // prop is only the first paint.
  const [calEvents, setCalEvents] = useState<DayCalendarEvent[]>(calendarEvents);
  const [calendar, setCalendar] = useState<CalendarStatus>(calendarStatus);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(
    calendarStatus.connected ? calendarStatus.lastSyncedAt : null,
  );
  const [syncedLabel, setSyncedLabel] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [calendarNotice, setCalendarNotice] = useState<string | null>(null);
  // Auto re-flow only after the user has planned once, at most once a minute.
  const hasPlannedRef = useRef(false);
  const lastReflowRef = useRef(0);
  // Auto calendar sync at most once per five minutes (mount + tab focus).
  const lastCalSyncRef = useRef(0);

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

  // A failed OAuth round-trip lands back here with ?calendar_error=1.
  // Read window.location in an effect (no Suspense boundary needed) and
  // strip the param so a refresh doesn't repeat the notice.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("calendar_error")) return;
    url.searchParams.delete("calendar_error");
    window.history.replaceState(
      window.history.state,
      "",
      url.pathname + url.search + url.hash,
    );
    // Deferred so the effect body itself never sets state synchronously.
    const t = setTimeout(
      () =>
        setCalendarNotice(
          "couldn't connect the calendar — nothing lost, try again whenever",
        ),
      0,
    );
    return () => clearTimeout(t);
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
        setPadding(data.padding ?? {});
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

  // "Plan my day" from the command palette lands here as ?plan=1.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("plan")) return;
    url.searchParams.delete("plan");
    window.history.replaceState(window.history.state, "", url.pathname + url.search);
    const t = setTimeout(() => void planDay(false), 0);
    return () => clearTimeout(t);
  }, [planDay]);

  const calendarConnected = calendar.available && calendar.connected;

  // Pull external events (local yesterday → +7 days) and, if anything out
  // there changed, let the plan quietly re-flow around it. Failures are
  // silent — the cached events stand and the day view never degrades.
  const syncCalendar = useCallback(
    async (auto: boolean) => {
      if (auto && Date.now() - lastCalSyncRef.current < 5 * 60_000) return;
      lastCalSyncRef.current = Date.now();
      if (!auto) setSyncing(true);
      try {
        const windowStart = new Date();
        windowStart.setDate(windowStart.getDate() - 1);
        windowStart.setHours(0, 0, 0, 0);
        const windowEnd = new Date();
        windowEnd.setDate(windowEnd.getDate() + 8);
        windowEnd.setHours(0, 0, 0, 0);
        const res = await fetch("/api/calendar/sync", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            windowStart: windowStart.toISOString(),
            windowEnd: windowEnd.toISOString(),
          }),
        });
        if (res.status === 409) {
          // The Google link is gone (revoked elsewhere). Quietly show the
          // connect affordance again; cached events stand.
          setCalendar((c) =>
            c.available ? { available: true, connected: false } : c,
          );
          return;
        }
        if (!res.ok) return; // 503 and friends — silent, cached events stand
        const data = (await res.json()) as CalendarSyncResult;
        setCalEvents(data.events);
        setLastSyncedAt(new Date().toISOString());
        // planDay's own 60s throttle keeps this from double-firing with the
        // focus-driven re-flow above.
        if (data.changed) void planDay(true);
      } catch {
        // silent — the cached events stand
      } finally {
        if (!auto) setSyncing(false);
      }
    },
    [planDay],
  );

  useEffect(() => {
    if (!calendarConnected) return;
    const mountSync = setTimeout(() => void syncCalendar(true), 0);
    const onFocus = () => void syncCalendar(true);
    window.addEventListener("focus", onFocus);
    return () => {
      clearTimeout(mountSync);
      window.removeEventListener("focus", onFocus);
    };
  }, [calendarConnected, syncCalendar]);

  // The "synced · 2m ago" whisper — computed on a timer, never at render.
  // (Rendering also guards on lastSyncedAt, so a stale label never shows.)
  useEffect(() => {
    if (!lastSyncedAt) return;
    const compute = () => {
      const mins = Math.max(
        0,
        Math.floor((Date.now() - new Date(lastSyncedAt).getTime()) / 60_000),
      );
      if (mins < 1) setSyncedLabel("just now");
      else if (mins < 60) setSyncedLabel(`${mins}m ago`);
      else setSyncedLabel(`${Math.floor(mins / 60)}h ago`);
    };
    const first = setTimeout(compute, 0);
    const t = setInterval(compute, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [lastSyncedAt]);

  const disconnectCalendar = useCallback(async () => {
    try {
      const res = await fetch("/api/calendar/disconnect", { method: "POST" });
      if (res.ok) {
        setCalendar((c) =>
          c.available ? { available: true, connected: false } : c,
        );
        setLastSyncedAt(null);
      }
    } catch {
      // silent — disconnecting can be retried anytime
    }
  }, []);

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
    const eventBlocks = calEvents
      .filter((e) => e.is_busy && isLocalToday(e.start))
      .map((e) => ({
        key: `event-${e.id}`,
        task: null as DayTask | null,
        title: e.title ?? "Busy",
        start: toMinutes(e.start),
        end: Math.max(toMinutes(e.end), toMinutes(e.start) + 15),
      }));
    return [...taskBlocks, ...eventBlocks];
  }, [tasks, calEvents]);

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
        (t) =>
          !t.is_fixed &&
          (t.status === "todo" || t.status === "rolled") &&
          t.planned_date === today,
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

  // Completing a task also (a) marks today active on the momentum strip and
  // (b) logs estimate-vs-actual when the task ran in a real block — both
  // fire-and-forget; the checkmark never waits on them.
  const recordCompletion = useCallback(
    (task: DayTask) => {
      const day = localToday();
      setMomentum((prev) => {
        const rest = prev.filter((m) => m.metric_date !== day);
        return [...rest, { metric_date: day, active: true }];
      });
      void supabase
        .from("momentum")
        .upsert(
          { user_id: userId, metric_date: day, active: true },
          { onConflict: "user_id,metric_date" },
        );
      if (!task.is_fixed && task.estimated_minutes && task.scheduled_start) {
        const actual = Math.round(
          (Date.now() - new Date(task.scheduled_start).getTime()) / 60_000,
        );
        // Only log when the block actually ran: finishing before it started
        // (or a wildly stale block) teaches the corrector nothing true.
        if (actual >= 1 && actual <= 8 * 60) {
          void supabase.from("estimate_history").insert({
            user_id: userId,
            energy_tag: task.energy_tag,
            estimated_minutes: task.estimated_minutes,
            actual_minutes: actual,
          });
        }
      }
    },
    [supabase, userId],
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
      else {
        if (!wasDone) {
          recordCompletion(task);
          if (task.recurrence) {
            void supabase.from("tasks").insert(nextRecurringInsert(task, userId));
          }
        }
        void planDay(true);
      }
    },
    [supabase, patchTask, planDay, recordCompletion, userId],
  );

  const moveToLater = useCallback(
    async (task: DayTask) => {
      const prev = { ...task };
      const nextIds = big3Ids.filter((id) => id !== task.id);
      patchTask(task.id, { planned_date: null, status: "todo" });
      setBig3Ids(nextIds);
      const { error: taskError } = await supabase
        .from("tasks")
        .update({ planned_date: null, is_big3: false, status: "todo" })
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

  // --- momentum (§7): a rolling strip, never a breakable streak ------------
  const momentumByDate = useMemo(
    () => new Map(momentum.map((m) => [m.metric_date, m.active])),
    [momentum],
  );

  const momentumDays = useMemo(() => {
    const out: { date: string; state: "active" | "rest" | "none"; isToday: boolean }[] = [];
    const d = new Date();
    d.setDate(d.getDate() - 27);
    for (let i = 0; i < 28; i++) {
      const key = fmtDate(d);
      const val = momentumByDate.get(key);
      out.push({
        date: key,
        state: val === true ? "active" : val === false ? "rest" : "none",
        isToday: key === today,
      });
      d.setDate(d.getDate() + 1);
    }
    return out;
  }, [momentumByDate, today]);

  const last20 = momentumDays.slice(-20);
  const active20 = last20.filter((x) => x.state === "active").length;
  const rest20 = last20.filter((x) => x.state === "rest").length;
  const denom20 = Math.max(1, 20 - rest20);

  // Comeback framing: a gap before today, with real history behind it,
  // earns a welcome — recovery is the success metric, not the streak.
  const comebackGap = useMemo(() => {
    if (!momentum.some((m) => m.active)) return null;
    let gap = 0;
    const d = new Date();
    for (let i = 0; i < 27; i++) {
      d.setDate(d.getDate() - 1);
      const val = momentumByDate.get(fmtDate(d));
      if (val === undefined) gap += 1;
      else break;
    }
    return gap >= 3 ? gap : null;
  }, [momentum, momentumByDate]);

  const todayIsRest = momentumByDate.get(today) === false;

  const toggleRestDay = useCallback(async () => {
    const day = localToday();
    if (momentumByDate.get(day) === false) {
      setMomentum((prev) => prev.filter((m) => m.metric_date !== day));
      await supabase
        .from("momentum")
        .delete()
        .eq("user_id", userId)
        .eq("metric_date", day);
    } else {
      setMomentum((prev) => [
        ...prev.filter((m) => m.metric_date !== day),
        { metric_date: day, active: false },
      ]);
      await supabase
        .from("momentum")
        .upsert(
          { user_id: userId, metric_date: day, active: false },
          { onConflict: "user_id,metric_date" },
        );
    }
  }, [momentumByDate, supabase, userId]);

  const rolledCount = tray.filter((t) => t.status === "rolled").length;
  const paddedTags = (Object.entries(padding) as [EnergyTag, number][]).filter(
    ([, f]) => f > 1.05,
  );

  // Day at a glance (v3): completion ring + a gentle workload meter.
  const dayFlexible = tasks.filter(
    (t) =>
      !t.is_fixed &&
      (t.status === "todo" ||
        t.status === "rolled" ||
        t.status === "scheduled" ||
        t.status === "done") &&
      (t.planned_date === today ||
        (t.scheduled_start && isLocalToday(t.scheduled_start))),
  );
  const dayTotal = dayFlexible.length;
  const dayDone = dayFlexible.filter((t) => t.status === "done").length;
  const fixedMins = fixedBlocks.reduce(
    (s, b) => s + Math.max(0, Math.min(b.end, dayEnd) - Math.max(b.start, dayStart)),
    0,
  );
  const availableMins = Math.max(60, dayEnd - dayStart - fixedMins);
  const scheduledMins = dayFlexible
    .filter((t) => t.status !== "done")
    .reduce((s, t) => s + (t.estimated_minutes ?? DEFAULT_TASK_MINUTES), 0);
  const workload = scheduledMins / availableMins;
  const workloadLabel =
    workload > 1 ? "a bit full" : workload > 0.75 ? "nicely full" : "room to breathe";

  // End-of-day reflection (§9 Phase 6): summarize the day the client already
  // holds and let the LLM edge find one kind, specific observation.
  const reflect = useCallback(async () => {
    setReflecting(true);
    setReflectNotice(null);
    try {
      const dayTasks = tasks
        .filter((t) => !t.is_fixed)
        .filter(
          (t) =>
            t.planned_date === today ||
            (t.scheduled_start && isLocalToday(t.scheduled_start)),
        )
        .slice(0, 100)
        .map((t) => {
          const actual =
            t.status === "done" && t.scheduled_start
              ? Math.round(
                  (Date.now() - new Date(t.scheduled_start).getTime()) / 60_000,
                )
              : null;
          return {
            title: t.title,
            status: (t.status === "inbox" ? "todo" : t.status) as
              | "done"
              | "scheduled"
              | "todo"
              | "rolled",
            energy_tag: t.energy_tag,
            estimated_minutes: t.estimated_minutes,
            actual_minutes: actual !== null && actual >= 1 && actual <= 480 ? actual : null,
            was_big3: big3Ids.includes(t.id) || t.is_big3,
          };
        });
      const res = await fetch("/api/reflect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          date: today,
          meetings: fixedBlocks.length,
          showed_up_days: active20,
          window_days: denom20,
          tasks: dayTasks,
        }),
      });
      if (!res.ok) {
        setReflectNotice(
          "Reflection isn't available right now — the day still counts.",
        );
        return;
      }
      const data = (await res.json()) as {
        insight: string;
        pattern: string | null;
        encouragement: string;
      };
      setReflection(data);
    } catch {
      setReflectNotice(
        "Reflection isn't available right now — the day still counts.",
      );
    } finally {
      setReflecting(false);
    }
  }, [tasks, today, big3Ids, fixedBlocks.length, active20, denom20]);

  const eveningReached = now >= dayEnd - 60;

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
          isIn ? "text-accent" : "text-faint hover:text-accent dark:text-faint",
          full && "cursor-default opacity-40 hover:text-faint",
          extraClass,
        )}
      >
        {isIn ? "★" : "☆"}
      </button>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 px-6 py-10 pb-28 sm:pb-10">
      <header className="flex items-baseline justify-between">
        <div>
          <span className="text-sm text-faint">Reflow</span>
          <h1 className="font-display text-3xl tracking-tight text-ink">{dateLabel}</h1>
          {calendarConnected && lastSyncedAt && syncedLabel && (
            <p className="text-[11px] text-faint dark:text-faint">
              calendar synced · {syncedLabel}
            </p>
          )}
        </div>
        <nav className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 text-sm text-faint">
          <ViewSwitcher />
          {calendar.available && !calendar.connected && (
            <a
              href="/api/calendar/connect"
              className="underline underline-offset-4 hover:text-muted"
            >
              connect Google Calendar
            </a>
          )}
          {calendar.available && calendar.connected && (
            <span className="flex items-center gap-1.5 text-xs">
              <span
                className="max-w-36 truncate"
                title={calendar.googleEmail ?? undefined}
              >
                {calendar.googleEmail ?? "Google Calendar"}
              </span>
              <button
                onClick={() => void syncCalendar(false)}
                disabled={syncing}
                className="underline underline-offset-4 hover:text-muted disabled:opacity-60"
              >
                {syncing ? "syncing…" : "sync"}
              </button>
            </span>
          )}
          <Link href="/inbox" className="hidden underline underline-offset-4 hover:text-muted sm:inline">
            Inbox
          </Link>
          <Link href="/settings" className="hidden underline underline-offset-4 hover:text-muted sm:inline">
            Settings
          </Link>
          <button
            onClick={() => void planDay(false)}
            disabled={planning}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-paper hover:bg-accent-strong disabled:opacity-60 dark:bg-accent dark:text-paper dark:hover:bg-accent-strong"
          >
            {planning ? "re-flowing…" : "Plan my day"}
          </button>
        </nav>
      </header>

      <CommandBar />

      {dayTotal > 0 && (
        <section
          aria-label="Day at a glance"
          className="flex items-center gap-4 rounded-lg border border-line px-4 py-3"
        >
          <Ring value={dayTotal ? dayDone / dayTotal : 0} size={48}>
            {dayDone}/{dayTotal}
          </Ring>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-baseline justify-between text-xs text-muted">
              <span>Today&apos;s load</span>
              <span className="text-faint">{workloadLabel}</span>
            </div>
            <Meter value={workload} />
          </div>
        </section>
      )}

      {planNotice && (
        <p className="rounded-lg border border-line px-4 py-2 text-sm text-muted dark:border-line">
          {planNotice}
        </p>
      )}

      {/* Momentum — dims, never resets (§7) */}
      <section aria-label="Momentum" className="space-y-2">
        {comebackGap !== null && (
          <p className="rounded-lg border border-line px-4 py-2 text-sm text-muted dark:border-line dark:text-muted">
            welcome back — you&apos;ve shown up {active20} of the last {denom20}{" "}
            days. that counts.
          </p>
        )}
        <div className="flex items-center gap-3">
          <div className="flex gap-0.75" aria-hidden>
            {momentumDays.map((d) => (
              <span
                key={d.date}
                title={d.date}
                className={cn(
                  "h-2 w-2 rounded-[3px]",
                  d.state === "active" &&
                    "bg-ink dark:bg-ink",
                  d.state === "rest" &&
                    "border border-line-strong bg-transparent dark:border-line-strong",
                  d.state === "none" && "bg-line",
                  d.isToday && "ring-1 ring-accent ring-offset-1 dark:ring-accent",
                )}
              />
            ))}
          </div>
          <span className="text-[11px] text-faint">
            {active20} of the last {denom20} days
            {rest20 > 0 && ` · ${rest20} rest`}
          </span>
        </div>
      </section>

      {paddedTags.length > 0 && (
        <p className="text-[11px] text-faint">
          estimates padded from your history:{" "}
          {paddedTags
            .map(([tag, f]) => `${tag} +${Math.round((f - 1) * 100)}%`)
            .join(" · ")}
        </p>
      )}

      {calendarNotice && (
        <p className="rounded-lg border border-line px-4 py-2 text-sm text-muted dark:border-line">
          {calendarNotice}
        </p>
      )}

      {/* Daily Big 3 — the day's definition of a win */}
      <section aria-label="Daily Big 3" className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-muted">Big 3</h2>
          <span className="text-xs text-faint">
            {big3.length === 0
              ? "star up to three tasks that would make today a win"
              : `${big3.filter((t) => t.status === "done").length} of ${big3.length} done`}
          </span>
        </div>
        {big3Done ? (
          <div className="relative flex items-center gap-3 overflow-hidden rounded-lg border border-accent-tint bg-accent-tint px-4 py-3 text-sm text-accent-text">
            <SunHorizon className="h-10 shrink-0" />
            <p>
              <span className="font-display">That&apos;s a win.</span> Your Big 3 are
              done — everything else today is a bonus.
            </p>
            <span className="win-sweep absolute inset-x-4 bottom-2 block h-px bg-accent" />
          </div>
        ) : null}
        {big3.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {big3.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm dark:border-line"
              >
                <button
                  onClick={() => void toggleDone(t)}
                  aria-label={t.status === "done" ? "Mark not done" : "Mark done"}
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                    t.status === "done"
                      ? "border-ink bg-ink text-paper"
                      : "border-line-strong",
                  )}
                >
                  {t.status === "done" && (
                    <Check className="h-2.5 w-2.5 motion-safe:animate-[toast-in_180ms_var(--ease-out)]" strokeWidth={3} />
                  )}
                </button>
                <span className={cn("truncate", t.status === "done" && "text-faint line-through")}>
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
                className="absolute left-0 right-0 border-t border-line dark:border-line"
                style={{ top: `${y(m)}px` }}
              >
                <span className="absolute -top-2 left-0 w-12 text-[11px] text-faint dark:text-faint">
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
                      ? "cursor-pointer border-accent bg-surface dark:border-accent dark:bg-surface"
                      : "border-transparent",
                  )}
                  style={{ top: `${y(g.start)}px`, height: `${(g.end - g.start) * PX_PER_MIN}px` }}
                >
                  {clickable && (
                    <span className="absolute inset-0 flex items-center justify-center text-xs text-muted">
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
                    className="timeline-block pointer-events-none absolute left-14 right-0 overflow-hidden rounded-md border border-dashed border-accent bg-accent-tint px-3 py-1"
                    style={{
                      top: `${y(Math.max(start, dayStart))}px`,
                      height: `${Math.max((Math.min(end, dayEnd) - Math.max(start, dayStart)) * PX_PER_MIN, 20)}px`,
                    }}
                  >
                    <p className="truncate text-[11px] text-accent-text dark:text-accent-text">
                      wildcard · breathing room
                    </p>
                  </div>
                );
              })}

            {/* Fixed blocks — immovable */}
            {fixedBlocks.map((b) => (
              <div
                key={b.key}
                className="absolute left-14 right-0 overflow-hidden rounded-md border border-line-strong bg-surface px-3 py-1 dark:border-line-strong dark:bg-surface"
                style={{
                  top: `${y(Math.max(b.start, dayStart))}px`,
                  height: `${Math.max((Math.min(b.end, dayEnd) - Math.max(b.start, dayStart)) * PX_PER_MIN, 20)}px`,
                }}
              >
                <p className="truncate text-xs font-medium text-muted dark:text-muted">
                  {b.title}
                </p>
                <p className="text-[11px] text-faint">
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
                    "timeline-block group absolute left-14 right-0 overflow-hidden rounded-md border border-l-[3px] px-3 py-1",
                    done
                      ? "border-line border-l-line bg-surface"
                      : cn(
                          "border-line bg-surface shadow-sm",
                          t.energy_tag ? ENERGY[t.energy_tag].borderL : "border-l-accent",
                        ),
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
                        done && "text-faint line-through",
                      )}
                    >
                      {big3Ids.includes(t.id) && <span className="text-accent">★ </span>}
                      {t.title}
                    </p>
                    <div className="flex shrink-0 gap-1 text-[11px] opacity-0 group-hover:opacity-100">
                      <button
                        onClick={() => void toggleDone(t)}
                        className="rounded border border-line-strong px-1.5 hover:border-line-strong dark:border-line-strong"
                      >
                        {done ? "undo" : "done"}
                      </button>
                      {!done && (
                        <button
                          onClick={() => void unschedule(t)}
                          title="Back to the tray — no harm done"
                          className="rounded border border-line-strong px-1.5 text-faint hover:border-line-strong dark:border-line-strong"
                        >
                          unplace
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-[11px] text-faint">
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
                className="now-line pointer-events-none absolute left-10 right-0 border-t border-accent"
                style={{ top: `${y(now)}px` }}
              >
                <span className="absolute -top-1 -left-1 h-2 w-2 rounded-full bg-accent" />
                <span className="absolute -top-2 -left-10 text-[10px] text-accent">now</span>
              </div>
            )}
          </div>
        </section>

        {/* Tray — today's tasks awaiting a slot */}
        <aside aria-label="To place" className="space-y-2">
          <h2 className="text-sm font-medium text-muted">To place</h2>
          {rolledCount > 0 && (
            <p className="text-[11px] text-faint">
              {rolledCount} rolled forward from before — fresh start, no
              baggage
            </p>
          )}
          {tray.length === 0 ? (
            <p className="text-xs text-faint">
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
                    "lift rounded-lg border px-3 py-2 text-sm",
                    placingId === t.id
                      ? "border-ink dark:border-ink"
                      : "border-line dark:border-line",
                  )}
                >
                  <div className="flex items-center gap-1">
                    <span className="min-w-0 flex-1 truncate">{t.title}</span>
                    {t.status === "rolled" && (
                      <span className="shrink-0 rounded-full border border-line px-1.5 py-0.5 text-[10px] text-faint dark:border-line">
                        rolled
                      </span>
                    )}
                    {star(t)}
                  </div>
                  {overflowIds.has(t.id) && (
                    <p className="mt-1 text-[11px] text-faint">
                      didn&apos;t fit today — it can wait, no harm done
                    </p>
                  )}
                  <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-faint">
                    <span>{t.estimated_minutes ?? DEFAULT_TASK_MINUTES}m</span>
                    {t.energy_tag && (
                      <span className={cn("inline-flex items-center gap-0.5", ENERGY[t.energy_tag].text)}>
                        <EnergyDot tag={t.energy_tag} />
                        {ENERGY[t.energy_tag].label}
                      </span>
                    )}
                    <span className="ml-auto flex gap-1">
                      <button
                        onClick={() => setPlacingId(placingId === t.id ? null : t.id)}
                        className={cn(
                          "rounded border px-1.5 py-0.5",
                          placingId === t.id
                            ? "border-ink font-medium dark:border-ink"
                            : "border-line-strong hover:border-line-strong dark:border-line-strong",
                        )}
                      >
                        {placingId === t.id ? "pick a gap…" : "place"}
                      </button>
                      <button
                        onClick={() => void toggleDone(t)}
                        className="rounded border border-line-strong px-1.5 py-0.5 hover:border-line-strong dark:border-line-strong"
                      >
                        done
                      </button>
                      <button
                        onClick={() => void moveToLater(t)}
                        title="Move to Later — it'll be there when you want it"
                        className="rounded border border-line-strong px-1.5 py-0.5 text-faint hover:border-line-strong dark:border-line-strong"
                      >
                        later
                      </button>
                      {overflowIds.has(t.id) && (
                        <button
                          onClick={() => void moveToTomorrow(t)}
                          title="Roll to tomorrow — it'll be first in line"
                          className="rounded border border-line-strong px-1.5 py-0.5 text-faint hover:border-line-strong dark:border-line-strong"
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
                  className="flex items-center gap-2 px-1 text-xs text-faint"
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
            <p className="text-[11px] leading-relaxed text-faint">
              Click a highlighted gap on the timeline to schedule{" "}
              <span className="font-medium text-muted">{placingTask.title}</span> (
              {placingMinutes}m).{" "}
              <button className="underline underline-offset-2" onClick={() => setPlacingId(null)}>
                cancel
              </button>
            </p>
          )}
        </aside>
      </div>

      {/* End of day — one kind look back, never a report card */}
      {(eveningReached || reflection) && (
        <section aria-label="Reflection" className="space-y-2">
          {reflection ? (
            <div className="space-y-1.5 rounded-lg border border-line px-4 py-3 text-sm dark:border-line">
              <p>{reflection.insight}</p>
              {reflection.pattern && (
                <p className="text-muted">{reflection.pattern}</p>
              )}
              <p className="text-faint">{reflection.encouragement}</p>
            </div>
          ) : (
            <div className="text-center">
              <button
                onClick={() => void reflect()}
                disabled={reflecting}
                className="text-xs text-faint underline underline-offset-4 hover:text-muted disabled:opacity-60"
              >
                {reflecting ? "looking back…" : "close the day — a short reflection"}
              </button>
            </div>
          )}
          {reflectNotice && (
            <p className="text-center text-xs text-faint">{reflectNotice}</p>
          )}
        </section>
      )}

      <p className="mt-auto pt-6 text-center text-xs text-faint dark:text-faint">
        plan my day re-flows around what&apos;s fixed · placing by hand always works
        {" · "}
        <button
          onClick={() => void toggleRestDay()}
          className="underline underline-offset-2 hover:text-muted"
        >
          {todayIsRest ? "rest day ✓ — undo" : "mark today a rest day"}
        </button>
        {calendarConnected && (
          <>
            {" · "}
            <button
              onClick={() => void disconnectCalendar()}
              className="underline underline-offset-2 hover:text-muted"
            >
              disconnect calendar
            </button>
          </>
        )}
      </p>
    </main>
  );
}
