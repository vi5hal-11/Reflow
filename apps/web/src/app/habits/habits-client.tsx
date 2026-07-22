"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { EmptyState } from "@/components/ui/empty-state";
import { SunHorizon } from "@/components/ui/sun-horizon";
import { useToast } from "@/components/ui/toast";
import {
  COLOR,
  HABIT_COLORS,
  HABIT_ICON_KEYS,
  colorOf,
  habitIcon,
  type HabitColor,
} from "@/components/habits/habit-meta";

export type Habit = {
  id: string;
  title: string;
  icon: string | null;
  color: string;
  kind: "habit" | "meditation" | "workout";
  cadence: "daily" | "weekly";
  target_per_week: number | null;
  position: number;
};
export type HabitLog = { habit_id: string; log_date: string; minutes: number | null };

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function lastNDays(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setDate(d.getDate() - (n - 1));
  for (let i = 0; i < n; i++) {
    out.push(ymd(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

const GRID_DAYS = 14;

export function HabitsClient({
  userId,
  initialHabits,
  initialLogs,
}: {
  userId: string;
  initialHabits: Habit[];
  initialLogs: HabitLog[];
}) {
  const supabase = createClient();
  const toast = useToast();
  const today = ymd(new Date());
  const days = useMemo(() => lastNDays(GRID_DAYS), []);

  const [habits, setHabits] = useState<Habit[]>(initialHabits);
  const [logged, setLogged] = useState<Set<string>>(
    () => new Set(initialLogs.map((l) => `${l.habit_id}|${l.log_date}`)),
  );
  const [creating, setCreating] = useState(false);

  const checkIn = useCallback(
    async (habit: Habit) => {
      const key = `${habit.id}|${today}`;
      const has = logged.has(key);
      setLogged((prev) => {
        const next = new Set(prev);
        if (has) next.delete(key);
        else next.add(key);
        return next;
      });
      if (has) {
        await supabase
          .from("habit_logs")
          .delete()
          .eq("habit_id", habit.id)
          .eq("log_date", today);
      } else {
        await supabase
          .from("habit_logs")
          .insert({ user_id: userId, habit_id: habit.id, log_date: today });
      }
    },
    [logged, today, supabase, userId],
  );

  const addHabit = useCallback(
    async (draft: { title: string; icon: string; color: HabitColor }) => {
      setCreating(false);
      const { data } = await supabase
        .from("habits")
        .insert({
          user_id: userId,
          title: draft.title,
          icon: draft.icon,
          color: draft.color,
          position: habits.length,
        })
        .select("id, title, icon, color, kind, cadence, target_per_week, position")
        .single();
      if (data) {
        setHabits((prev) => [...prev, data as Habit]);
        toast("Habit added.", "accent");
      }
    },
    [supabase, userId, habits.length, toast],
  );

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-6 py-10 pb-28 sm:pb-10">
      <header className="flex items-baseline justify-between">
        <div>
          <span className="text-sm text-faint">Reflow</span>
          <h1 className="font-display text-3xl tracking-tight text-ink">Habits</h1>
        </div>
        <div className="flex items-center gap-4 text-sm text-muted">
          <Link href="/today" className="hidden underline underline-offset-4 hover:text-ink sm:inline">
            Today
          </Link>
          <Button size="sm" onClick={() => setCreating(true)}>
            New habit
          </Button>
        </div>
      </header>

      <p className="text-sm text-muted">
        Show up when you can. The grid fills as you do — it dims on a quiet day,
        but never resets and never counts against you.
      </p>

      {habits.length === 0 ? (
        <EmptyState
          art={<SunHorizon />}
          title="No habits yet."
          hint="Add one small thing you'd like to return to — read, move, breathe."
          action={
            <Button size="sm" onClick={() => setCreating(true)}>
              Add a habit
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {habits.map((h) => {
            const color = colorOf(h.color);
            const Icon = habitIcon(h.icon);
            const doneToday = logged.has(`${h.id}|${today}`);
            const shownUp = days.filter((d) => logged.has(`${h.id}|${d}`)).length;
            return (
              <li key={h.id} className="lift rounded-lg border border-line bg-surface p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-paper",
                        COLOR[color].bg,
                      )}
                    >
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="truncate font-medium text-ink">{h.title}</span>
                  </div>
                  <button
                    onClick={() => void checkIn(h)}
                    aria-pressed={doneToday}
                    className={cn(
                      "press shrink-0 rounded-sm border px-3 py-1.5 text-sm font-medium transition-colors",
                      doneToday
                        ? cn("border-transparent text-paper", COLOR[color].bg)
                        : "border-line-strong text-muted hover:border-accent",
                    )}
                  >
                    {doneToday ? "✓ Today" : "Check in"}
                  </button>
                </div>

                <div className="mt-3 flex items-center gap-3">
                  <div className="flex gap-1">
                    {days.map((d) => {
                      const on = logged.has(`${h.id}|${d}`);
                      return (
                        <span
                          key={d}
                          title={d}
                          className={cn(
                            "h-3.5 w-3.5 rounded-[3px]",
                            on ? COLOR[color].bg : "bg-line",
                            d === today && "ring-1 ring-accent ring-offset-1",
                          )}
                        />
                      );
                    })}
                  </div>
                  <span className="ml-auto text-[11px] text-faint">
                    {shownUp} of {GRID_DAYS} days
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {creating && <CreateHabit onClose={() => setCreating(false)} onCreate={addHabit} />}
    </main>
  );
}

function CreateHabit({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (d: { title: string; icon: string; color: HabitColor }) => void;
}) {
  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState(HABIT_ICON_KEYS[0]);
  const [color, setColor] = useState<HabitColor>("sage");

  return (
    <Sheet open onClose={onClose} title="New habit">
      <div className="flex flex-col gap-4">
        <label className="space-y-1.5">
          <span className="text-sm text-muted">What would you like to return to?</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. read · move · breathe"
            className="w-full rounded-sm border border-line-strong bg-transparent px-3 py-2.5 text-sm text-ink outline-none placeholder:text-faint focus:border-accent"
          />
        </label>

        <div className="space-y-1.5">
          <span className="text-sm text-muted">Icon</span>
          <div className="flex flex-wrap gap-2">
            {HABIT_ICON_KEYS.map((k) => {
              const Icon = habitIcon(k);
              return (
                <button
                  key={k}
                  onClick={() => setIcon(k)}
                  aria-pressed={icon === k}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-md border transition-colors",
                    icon === k ? "border-accent text-ink" : "border-line text-muted hover:border-accent",
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <span className="text-sm text-muted">Colour</span>
          <div className="flex flex-wrap gap-2">
            {HABIT_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                aria-label={c}
                aria-pressed={color === c}
                className={cn(
                  "h-7 w-7 rounded-full",
                  COLOR[c].bg,
                  color === c && "ring-2 ring-accent ring-offset-2",
                )}
              />
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!title.trim()}
            onClick={() => onCreate({ title: title.trim(), icon, color })}
          >
            Add habit
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
