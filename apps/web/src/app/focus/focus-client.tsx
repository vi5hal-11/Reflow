"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ViewSwitcher } from "@/components/app-shell/view-switcher";
import { CommandBar } from "@/components/command/command-trigger";
import { useToast } from "@/components/ui/toast";
import { nextRecurringInsert } from "@/lib/recurrence";
import type { DayTask } from "@/lib/types";

const DEFAULT_TASK_MINUTES = 30;

function nowMs(): number {
  return new Date().getTime();
}
function toMs(iso: string): number {
  return new Date(iso).getTime();
}
function isLocalToday(iso: string): boolean {
  const d = new Date(iso);
  const n = new Date();
  return (
    d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate()
  );
}
function fmtClock(ms: number): string {
  const d = new Date(ms);
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h}${ampm}` : `${h}:${String(m).padStart(2, "0")}${ampm}`;
}
function humanLeft(mins: number): string {
  if (mins <= 0) return "wrapping up";
  if (mins < 60) return `${mins} min left`;
  const h = Math.floor(mins / 60);
  const r = mins % 60;
  return r ? `${h}h ${r}m left` : `${h}h left`;
}

export function FocusClient({
  userId,
  initialTasks,
}: {
  userId: string;
  initialTasks: DayTask[];
}) {
  const supabase = createClient();
  const toast = useToast();
  const [tasks, setTasks] = useState<DayTask[]>(initialTasks);
  const [now, setNow] = useState(nowMs);

  useEffect(() => {
    const t = setInterval(() => setNow(nowMs()), 15_000);
    return () => clearInterval(t);
  }, []);

  const todays = useMemo(
    () =>
      tasks
        .filter((t) => t.scheduled_start && isLocalToday(t.scheduled_start))
        .sort((a, b) => toMs(a.scheduled_start!) - toMs(b.scheduled_start!)),
    [tasks],
  );
  const doneCount = todays.filter((t) => t.status === "done").length;
  const pending = todays.filter((t) => t.status !== "done");

  // Current = the in-progress block, else the next upcoming, else the first
  // pending. "Next" is whatever pending block follows it.
  const current = useMemo(() => {
    const inProgress = pending.find((t) => {
      const s = toMs(t.scheduled_start!);
      const e = t.scheduled_end
        ? toMs(t.scheduled_end)
        : s + DEFAULT_TASK_MINUTES * 60_000;
      return s <= now && now < e;
    });
    return inProgress ?? pending.find((t) => toMs(t.scheduled_start!) >= now) ?? pending[0] ?? null;
  }, [pending, now]);

  const next = useMemo(() => {
    if (!current) return null;
    const i = pending.findIndex((t) => t.id === current.id);
    return i >= 0 ? pending[i + 1] ?? null : null;
  }, [pending, current]);

  const complete = useCallback(
    async (task: DayTask) => {
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: "done" } : t)),
      );
      const day = new Date();
      const metric = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
      const [{ error }] = await Promise.all([
        supabase.from("tasks").update({ status: "done" }).eq("id", task.id),
        supabase
          .from("momentum")
          .upsert(
            { user_id: userId, metric_date: metric, active: true },
            { onConflict: "user_id,metric_date" },
          ),
      ]);
      if (error) {
        setTasks((prev) =>
          prev.map((t) => (t.id === task.id ? { ...t, status: task.status } : t)),
        );
        toast("Couldn't save — try again.");
      } else if (task.recurrence) {
        void supabase.from("tasks").insert(nextRecurringInsert(task, userId));
      }
    },
    [supabase, userId, toast],
  );

  const header = (
    <header className="flex items-baseline justify-between">
      <div>
        <span className="text-sm text-faint">Reflow</span>
        <h1 className="font-display text-3xl tracking-tight text-ink">Focus</h1>
      </div>
      <ViewSwitcher />
    </header>
  );

  if (!current) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-8 px-6 py-10 pb-28 sm:pb-10">
        {header}
        <CommandBar />
        <EmptyState
          title={
            todays.length > 0
              ? "That's everything scheduled. Nicely done."
              : "Nothing scheduled to focus on yet."
          }
          hint={
            todays.length > 0
              ? "Your day is clear — rest, or line up more from the inbox."
              : "Plan your day and Focus will walk you through it, one block at a time."
          }
          action={
            <Link
              href="/today?plan=1"
              className="text-sm text-accent-text underline underline-offset-4"
            >
              Plan my day
            </Link>
          }
        />
      </main>
    );
  }

  const start = toMs(current.scheduled_start!);
  const end = current.scheduled_end
    ? toMs(current.scheduled_end)
    : start + (current.estimated_minutes ?? DEFAULT_TASK_MINUTES) * 60_000;
  const started = now >= start;
  const total = Math.max(1, end - start);
  const progress = started ? Math.min(1, (now - start) / total) : 0;
  const minsLeft = Math.round((end - now) / 60_000);
  const minsToStart = Math.round((start - now) / 60_000);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-8 px-6 py-10 pb-28 sm:pb-10">
      {header}
      <CommandBar />

      <p className="text-sm text-muted">
        {started ? "Now" : "Up next"} · {doneCount} of {todays.length} done today
      </p>

      <section
        aria-label="Current task"
        className="rounded-lg border border-line bg-surface p-6 shadow-sm"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-medium text-ink">
            {current.is_big3 && <span className="text-accent">★ </span>}
            {current.title}
          </h2>
          <span className="tabular shrink-0 pt-1 text-sm text-faint">
            {fmtClock(start)}–{fmtClock(end)}
          </span>
        </div>

        <p className="mt-1 text-sm text-muted">
          {started ? humanLeft(minsLeft) : `starts in ${Math.max(0, minsToStart)} min`}
          {current.energy_tag ? ` · ${current.energy_tag}` : ""}
        </p>

        <div className="mt-4 h-1.5 overflow-hidden rounded-pill bg-accent-tint">
          <div
            className="h-full rounded-pill bg-accent transition-[width] duration-500"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>

        <div className="mt-5 flex items-center gap-2">
          <Button onClick={() => void complete(current)}>✓ Done</Button>
          <Link href="/today">
            <Button variant="quiet">Back to the day</Button>
          </Link>
        </div>
      </section>

      {next ? (
        <div className="text-sm text-muted">
          <span className="text-faint">Next ↓ </span>
          {next.is_big3 && <span className="text-accent">★ </span>}
          {next.title}
          <span className="tabular text-faint"> · {fmtClock(toMs(next.scheduled_start!))}</span>
        </div>
      ) : (
        <p className="text-sm text-faint">Last one on the list. Almost there.</p>
      )}

      <p className="mt-auto pt-6 text-center text-xs text-faint">
        one thing at a time · finish to advance
      </p>
    </main>
  );
}
