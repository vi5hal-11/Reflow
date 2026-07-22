"use client";

import Link from "next/link";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { ViewSwitcher } from "@/components/app-shell/view-switcher";
import { CommandBar } from "@/components/command/command-trigger";
import type { DayTask } from "@/lib/types";

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function localDayOf(iso: string): string {
  return ymd(new Date(iso));
}
function fmtClock(iso: string): string {
  const d = new Date(iso);
  let h = d.getHours();
  const m = d.getMinutes();
  const ap = h >= 12 ? "pm" : "am";
  h = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h}${ap}` : `${h}:${String(m).padStart(2, "0")}${ap}`;
}

const MAX_PER_DAY = 5;

export function WeekClient({ tasks }: { tasks: DayTask[] }) {
  const { days, todayStr } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = ymd(today);
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today.getTime() + i * 24 * 60 * 60 * 1000);
      return { date: d, key: ymd(d) };
    });

    const byDay = new Map<string, DayTask[]>();
    for (const { key } of days) byDay.set(key, []);
    for (const t of tasks) {
      const key =
        t.scheduled_start && byDay.has(localDayOf(t.scheduled_start))
          ? localDayOf(t.scheduled_start)
          : t.planned_date && byDay.has(t.planned_date)
            ? t.planned_date
            : null;
      if (key) byDay.get(key)!.push(t);
    }
    for (const [, list] of byDay) {
      list.sort((a, b) => {
        const as = a.scheduled_start ? new Date(a.scheduled_start).getTime() : Infinity;
        const bs = b.scheduled_start ? new Date(b.scheduled_start).getTime() : Infinity;
        return as - bs || a.title.localeCompare(b.title);
      });
    }
    return {
      todayStr,
      days: days.map((d) => ({ ...d, tasks: byDay.get(d.key)! })),
    };
  }, [tasks]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-6 px-6 py-10 pb-28 sm:pb-10">
      <header className="flex items-baseline justify-between">
        <div>
          <span className="text-sm text-faint">Reflow</span>
          <h1 className="font-display text-3xl tracking-tight text-ink">The week</h1>
        </div>
        <ViewSwitcher />
      </header>

      <CommandBar />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
        {days.map(({ date, key, tasks: dayTasks }) => {
          const isToday = key === todayStr;
          const done = dayTasks.filter((t) => t.status === "done").length;
          return (
            <section
              key={key}
              className={cn(
                "lift flex flex-col gap-2 rounded-lg border p-3",
                isToday ? "border-accent" : "border-line",
              )}
            >
              <Link href="/today" className="flex items-baseline justify-between">
                <span
                  className={cn(
                    "text-sm font-medium",
                    isToday ? "text-accent-text" : "text-ink",
                  )}
                >
                  {date.toLocaleDateString(undefined, { weekday: "short" })}{" "}
                  <span className="tabular text-faint">{date.getDate()}</span>
                </span>
                {dayTasks.length > 0 && (
                  <span className="tabular text-[11px] text-faint">
                    {done}/{dayTasks.length}
                  </span>
                )}
              </Link>

              {dayTasks.length === 0 ? (
                <p className="py-2 text-xs text-faint">—</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {dayTasks.slice(0, MAX_PER_DAY).map((t) => (
                    <li
                      key={t.id}
                      className={cn(
                        "truncate text-xs",
                        t.status === "done" ? "text-faint line-through" : "text-muted",
                      )}
                    >
                      {t.is_big3 && <span className="text-accent">★ </span>}
                      {t.scheduled_start && (
                        <span className="tabular text-faint">
                          {fmtClock(t.scheduled_start)}{" "}
                        </span>
                      )}
                      {t.title}
                    </li>
                  ))}
                  {dayTasks.length > MAX_PER_DAY && (
                    <li className="text-[11px] text-faint">
                      +{dayTasks.length - MAX_PER_DAY} more
                    </li>
                  )}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <p className="mt-auto pt-6 text-center text-xs text-faint">
        a calm look ahead · open Today to plan and place
      </p>
    </main>
  );
}
