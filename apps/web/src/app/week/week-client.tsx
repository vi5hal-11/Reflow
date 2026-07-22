"use client";

import Link from "next/link";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { ViewSwitcher } from "@/components/app-shell/view-switcher";
import { CommandBar } from "@/components/command/command-trigger";
import { ENERGY } from "@/components/ui/energy";
import type { DayTask } from "@/lib/types";

const PX_PER_HOUR = 44;
const DEFAULT_FIXED_MIN = 60;
const DEFAULT_TASK_MIN = 30;

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function minsOfDay(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}
function fmtHour(h: number): string {
  const ap = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${ap}`;
}

type Timed = {
  task: DayTask;
  startMin: number;
  endMin: number;
};

export function WeekClient({ tasks }: { tasks: DayTask[] }) {
  const { days, todayStr, startHour, endHour } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = ymd(today);
    const dayList = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today.getTime() + i * 24 * 60 * 60 * 1000);
      return { date: d, key: ymd(d) };
    });
    const keys = new Set(dayList.map((d) => d.key));

    const timed = new Map<string, Timed[]>();
    const untimed = new Map<string, DayTask[]>();
    for (const { key } of dayList) {
      timed.set(key, []);
      untimed.set(key, []);
    }

    let lo = 9 * 60;
    let hi = 18 * 60;
    for (const t of tasks) {
      const at = t.scheduled_start ?? (t.is_fixed ? t.fixed_start : null);
      if (at) {
        const key = ymd(new Date(at));
        if (!keys.has(key)) continue;
        const startMin = minsOfDay(at);
        const dur = t.scheduled_end
          ? minsOfDay(t.scheduled_end) - startMin
          : t.is_fixed
            ? (t.estimated_minutes ?? DEFAULT_FIXED_MIN)
            : (t.estimated_minutes ?? DEFAULT_TASK_MIN);
        const endMin = startMin + Math.max(20, dur);
        timed.get(key)!.push({ task: t, startMin, endMin });
        lo = Math.min(lo, startMin);
        hi = Math.max(hi, endMin);
      } else if (t.planned_date && keys.has(t.planned_date)) {
        untimed.get(t.planned_date)!.push(t);
      }
    }

    const startHour = Math.max(0, Math.floor(lo / 60));
    const endHour = Math.min(24, Math.ceil(hi / 60));

    return {
      todayStr,
      startHour,
      endHour,
      days: dayList.map((d) => ({
        ...d,
        timed: timed.get(d.key)!.sort((a, b) => a.startMin - b.startMin),
        untimed: untimed.get(d.key)!,
      })),
    };
  }, [tasks]);

  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const gridHeight = hours.length * PX_PER_HOUR;
  const y = (min: number) => ((min - startHour * 60) / 60) * PX_PER_HOUR;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-6 px-6 py-10 pb-28 sm:pb-10">
      <header className="flex items-baseline justify-between">
        <div>
          <span className="text-sm text-faint">Reflow</span>
          <h1 className="font-display text-3xl tracking-tight text-ink">The week</h1>
        </div>
        <ViewSwitcher />
      </header>

      <CommandBar />

      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          {/* day headers */}
          <div className="grid grid-cols-[3rem_repeat(7,1fr)] border-b border-line">
            <div />
            {days.map(({ date, key, untimed }) => {
              const isToday = key === todayStr;
              return (
                <Link
                  key={key}
                  href="/today"
                  className={cn(
                    "flex flex-col items-center gap-0.5 py-2 text-center",
                    isToday ? "text-accent-text" : "text-muted",
                  )}
                >
                  <span className="text-xs">
                    {date.toLocaleDateString(undefined, { weekday: "short" })}
                  </span>
                  <span
                    className={cn(
                      "tabular text-sm font-medium",
                      isToday &&
                        "flex h-6 w-6 items-center justify-center rounded-full bg-accent text-paper",
                    )}
                  >
                    {date.getDate()}
                  </span>
                  {untimed.length > 0 && (
                    <span className="text-[10px] text-faint">{untimed.length} to place</span>
                  )}
                </Link>
              );
            })}
          </div>

          {/* time grid */}
          <div className="grid grid-cols-[3rem_repeat(7,1fr)]">
            {/* hour gutter */}
            <div className="relative" style={{ height: gridHeight }}>
              {hours.map((h) => (
                <div
                  key={h}
                  className="absolute right-1 -translate-y-1/2 text-[10px] text-faint"
                  style={{ top: y(h * 60) }}
                >
                  {fmtHour(h)}
                </div>
              ))}
            </div>

            {days.map(({ key, timed }) => (
              <div
                key={key}
                className="relative border-l border-line"
                style={{ height: gridHeight }}
              >
                {hours.map((h) => (
                  <div
                    key={h}
                    className="absolute inset-x-0 border-t border-line/60"
                    style={{ top: y(h * 60) }}
                  />
                ))}
                {timed.map(({ task, startMin, endMin }) => {
                  const done = task.status === "done";
                  const rail =
                    task.is_fixed || !task.energy_tag
                      ? "border-l-line-strong"
                      : ENERGY[task.energy_tag].borderL;
                  return (
                    <div
                      key={task.id}
                      title={task.title}
                      className={cn(
                        "absolute inset-x-0.5 overflow-hidden rounded-md border border-l-[3px] px-1.5 py-0.5",
                        done ? "border-line bg-surface" : cn("border-line bg-surface", rail),
                      )}
                      style={{
                        top: Math.max(0, y(startMin)),
                        height: Math.max(16, y(endMin) - y(startMin)),
                      }}
                    >
                      <p
                        className={cn(
                          "truncate text-[10px] leading-tight",
                          done ? "text-faint line-through" : "text-ink",
                        )}
                      >
                        {task.is_big3 && <span className="text-accent">★</span>}
                        {task.title}
                      </p>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-auto pt-6 text-center text-xs text-faint">
        a look ahead · open Today to plan and place
      </p>
    </main>
  );
}
