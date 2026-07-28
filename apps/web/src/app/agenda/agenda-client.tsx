"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Check, CircleDashed, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { CommandBar } from "@/components/command/command-trigger";
import { EmptyState } from "@/components/ui/empty-state";
import { SunHorizon } from "@/components/ui/sun-horizon";
import { Ring } from "@/components/ui/ring";
import { ENERGY } from "@/components/ui/energy";
import type { DayTask } from "@/lib/types";

const DEFAULT_TASK_MINUTES = 30;
const DEFAULT_FIXED_MINUTES = 60;

function isLocalToday(iso: string): boolean {
  const d = new Date(iso);
  const n = new Date();
  return (
    d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate()
  );
}

function minutesOf(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

function fmtClock(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function fmtDuration(mins: number): string {
  if (mins <= 0) return "0m";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

type Row = {
  task: DayTask;
  start: number | null;
  end: number | null;
  fixed: boolean;
};

export function AgendaClient({ initialTasks }: { initialTasks: DayTask[] }) {
  // -1 until mount: "now" is local and would mismatch the UTC server render.
  const [now, setNow] = useState(-1);
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setNow(d.getHours() * 60 + d.getMinutes());
    };
    const t0 = setTimeout(tick, 0);
    const iv = setInterval(tick, 60_000);
    return () => {
      clearTimeout(t0);
      clearInterval(iv);
    };
  }, []);

  const { timed, untimed, done, total, remaining } = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const timed: Row[] = [];
    const untimed: Row[] = [];

    for (const t of initialTasks) {
      if (t.is_optional) continue; // bonus work has no claim on the day's time
      const anchor = t.is_fixed ? t.fixed_start : t.scheduled_start;
      if (anchor && isLocalToday(anchor)) {
        const start = minutesOf(anchor);
        const end = t.scheduled_end
          ? minutesOf(t.scheduled_end)
          : start + (t.estimated_minutes ?? (t.is_fixed ? DEFAULT_FIXED_MINUTES : DEFAULT_TASK_MINUTES));
        timed.push({ task: t, start, end, fixed: Boolean(t.is_fixed) });
      } else if (
        t.planned_date === today &&
        (t.status === "todo" || t.status === "rolled" || t.status === "done")
      ) {
        untimed.push({ task: t, start: null, end: null, fixed: false });
      }
    }

    timed.sort((a, b) => (a.start ?? 0) - (b.start ?? 0));

    const all = [...timed, ...untimed];
    const done = all.filter((r) => r.task.status === "done").length;
    const remaining = all
      .filter((r) => r.task.status !== "done")
      .reduce(
        (sum, r) =>
          sum +
          (r.end != null && r.start != null
            ? r.end - r.start
            : (r.task.estimated_minutes ?? DEFAULT_TASK_MINUTES)),
        0,
      );

    return { timed, untimed, done, total: all.length, remaining };
  }, [initialTasks]);

  function row(r: Row, showNowRule: boolean) {
    const t = r.task;
    const isDone = t.status === "done";
    const rail =
      r.fixed || !t.energy_tag ? "border-l-line-strong" : ENERGY[t.energy_tag].borderL;

    return (
      <li key={t.id}>
        {showNowRule && (
          <div className="relative my-2 flex items-center gap-2" aria-hidden>
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
            <span className="h-px flex-1 bg-accent" />
            <span className="text-[10px] text-accent-text">now</span>
          </div>
        )}
        <div
          className={cn(
            "flex items-center gap-3 rounded-lg border border-l-[3px] border-line px-3 py-2.5",
            rail,
            isDone && "opacity-70",
          )}
        >
          <span
            className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
              isDone ? "border-ink bg-ink text-paper" : "border-line-strong text-faint",
            )}
          >
            {isDone ? (
              <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
            ) : r.fixed ? (
              <Lock className="h-3 w-3" aria-hidden />
            ) : (
              <CircleDashed className="h-3 w-3" aria-hidden />
            )}
          </span>

          <span className="min-w-0 flex-1">
            <span
              className={cn(
                "block truncate text-sm",
                isDone ? "text-faint line-through" : "text-ink",
              )}
            >
              {t.is_big3 && <span className="text-accent">★ </span>}
              {t.title}
            </span>
            <span className="block text-[11px] text-faint">
              {r.fixed
                ? "fixed"
                : t.energy_tag
                  ? t.energy_tag
                  : `${t.estimated_minutes ?? DEFAULT_TASK_MINUTES}m`}
              {t.status === "rolled" && " · rolled forward"}
            </span>
          </span>

          <span className="tabular shrink-0 text-right text-[11px] text-faint">
            {r.start != null ? fmtClock(r.start) : "—"}
          </span>
        </div>
      </li>
    );
  }

  // The now-rule goes before the first block that hasn't started yet.
  const nowIndex =
    now < 0 ? -1 : timed.findIndex((r) => (r.start ?? 0) > now);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-6 py-10 pb-28 sm:pb-10">
      <header className="flex items-baseline justify-between">
        <div>
          <span className="text-sm text-faint">Reflow</span>
          <h1 className="font-display text-3xl tracking-tight text-ink">Agenda</h1>
        </div>
        <Link
          href="/today"
          className="text-sm text-muted underline underline-offset-4 hover:text-ink"
        >
          Today
        </Link>
      </header>

      <CommandBar />

      {total === 0 ? (
        <EmptyState
          art={<SunHorizon />}
          title="Nothing on the day yet."
          hint="Triage a few things to today, then plan — they'll show up here with their times."
        />
      ) : (
        <>
          <section
            aria-label="Day summary"
            className="flex items-center gap-4 rounded-lg border border-line bg-surface px-4 py-3"
          >
            <Ring value={total ? done / total : 0} size={48}>
              {done}/{total}
            </Ring>
            <div className="min-w-0">
              <p className="text-sm text-ink">
                {done === total
                  ? "Everything's done."
                  : `${fmtDuration(remaining)} of work still ahead`}
              </p>
              <p className="text-[11px] text-faint">
                {done} done · {total - done} to go — whatever doesn&apos;t land
                rolls gently forward.
              </p>
            </div>
          </section>

          {timed.length > 0 && (
            <section aria-label="Scheduled" className="space-y-2">
              <h2 className="text-[11px] font-medium tracking-wide text-muted uppercase">
                Scheduled
              </h2>
              <ul className="flex flex-col gap-2">
                {timed.map((r, i) => row(r, i === nowIndex))}
              </ul>
              {/* Day already over: the rule belongs at the very end. */}
              {now >= 0 && nowIndex === -1 && timed.length > 0 && (
                <div className="flex items-center gap-2 pt-1" aria-hidden>
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  <span className="h-px flex-1 bg-accent" />
                  <span className="text-[10px] text-accent-text">now</span>
                </div>
              )}
            </section>
          )}

          {untimed.length > 0 && (
            <section aria-label="Not yet placed" className="space-y-2">
              <h2 className="text-[11px] font-medium tracking-wide text-muted uppercase">
                Not yet placed
              </h2>
              <ul className="flex flex-col gap-2">
                {untimed.map((r) => row(r, false))}
              </ul>
            </section>
          )}
        </>
      )}

      <p className="mt-auto pt-6 text-center text-xs text-faint">
        a read of the day · place and complete over on{" "}
        <Link href="/today" className="underline underline-offset-2">
          Today
        </Link>
      </p>
    </main>
  );
}
