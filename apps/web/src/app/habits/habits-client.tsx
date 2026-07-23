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
  HABIT_KINDS,
  KIND_META,
  colorOf,
  habitIcon,
  type HabitColor,
  type HabitKind,
} from "@/components/habits/habit-meta";
import { MoodCheckin } from "@/components/habits/mood-checkin";
import { MeditationTimer } from "@/components/habits/meditation-timer";

export type Habit = {
  id: string;
  title: string;
  icon: string | null;
  color: string;
  kind: HabitKind;
  cadence: "daily" | "weekly";
  target_per_week: number | null;
  position: number;
};
export type HabitLog = { habit_id: string; log_date: string; minutes: number | null };

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// N days ending at `end` (a YYYY-MM-DD string) — parsed at local noon so the
// day-stepping never trips over a DST or timezone boundary.
function lastNDays(n: number, end: string): string[] {
  const [y, m, day] = end.split("-").map(Number);
  const d = new Date(y, m - 1, day, 12);
  d.setDate(d.getDate() - (n - 1));
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(ymd(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

const GRID_DAYS = 14;

export function HabitsClient({
  userId,
  today,
  initialHabits,
  initialLogs,
  initialMood,
  initialMoodNote,
}: {
  userId: string;
  today: string;
  initialHabits: Habit[];
  initialLogs: HabitLog[];
  initialMood: number | null;
  initialMoodNote: string | null;
}) {
  const supabase = createClient();
  const toast = useToast();
  const days = useMemo(() => lastNDays(GRID_DAYS, today), [today]);

  const [habits, setHabits] = useState<Habit[]>(initialHabits);
  const [logged, setLogged] = useState<Set<string>>(
    () => new Set(initialLogs.map((l) => `${l.habit_id}|${l.log_date}`)),
  );
  const [minutes, setMinutes] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    for (const l of initialLogs) if (l.minutes) m[`${l.habit_id}|${l.log_date}`] = l.minutes;
    return m;
  });
  const [creating, setCreating] = useState(false);
  const [timerHabit, setTimerHabit] = useState<Habit | null>(null);
  const [workoutHabit, setWorkoutHabit] = useState<Habit | null>(null);

  // Plain check-in toggle (kind === "habit").
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
        await supabase.from("habit_logs").delete().eq("habit_id", habit.id).eq("log_date", today);
      } else {
        await supabase
          .from("habit_logs")
          .insert({ user_id: userId, habit_id: habit.id, log_date: today });
      }
    },
    [logged, today, supabase, userId],
  );

  // Timed kinds (meditation / workout) — accumulate minutes into today's log.
  const logMinutes = useCallback(
    async (habit: Habit, mins: number) => {
      const key = `${habit.id}|${today}`;
      const next = (minutes[key] ?? 0) + mins;
      setLogged((prev) => new Set(prev).add(key));
      setMinutes((prev) => ({ ...prev, [key]: next }));
      await supabase.from("habit_logs").upsert(
        { user_id: userId, habit_id: habit.id, log_date: today, minutes: next },
        { onConflict: "habit_id,log_date" },
      );
      toast(`${mins} min logged.`, "accent");
    },
    [minutes, today, supabase, userId, toast],
  );

  const addHabit = useCallback(
    async (draft: { title: string; icon: string; color: HabitColor; kind: HabitKind }) => {
      setCreating(false);
      const { data } = await supabase
        .from("habits")
        .insert({
          user_id: userId,
          title: draft.title,
          icon: draft.icon,
          color: draft.color,
          kind: draft.kind,
          position: habits.length,
        })
        .select("id, title, icon, color, kind, cadence, target_per_week, position")
        .single();
      if (data) {
        setHabits((prev) => [...prev, data as Habit]);
        toast("Added.", "accent");
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
          <Link href="/journal" className="underline underline-offset-4 hover:text-ink">
            Journal
          </Link>
          <Button size="sm" onClick={() => setCreating(true)}>
            New
          </Button>
        </div>
      </header>

      <MoodCheckin
        userId={userId}
        today={today}
        initialMood={initialMood}
        initialNote={initialMoodNote}
      />

      <p className="text-sm text-muted">
        Show up when you can. The grid fills as you do — it dims on a quiet day,
        but never resets and never counts against you.
      </p>

      {habits.length === 0 ? (
        <EmptyState
          art={<SunHorizon />}
          title="No habits yet."
          hint="Add one small thing you'd like to return to — read, move, breathe, sit."
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
            const key = `${h.id}|${today}`;
            const doneToday = logged.has(key);
            const todayMin = minutes[key] ?? 0;
            const shownUp = days.filter((d) => logged.has(`${h.id}|${d}`)).length;
            const timed = h.kind !== "habit";
            const label = doneToday
              ? timed
                ? `✓ ${todayMin}m`
                : "✓ Today"
              : KIND_META[h.kind].verb;
            const onAction =
              h.kind === "meditation"
                ? () => setTimerHabit(h)
                : h.kind === "workout"
                  ? () => setWorkoutHabit(h)
                  : () => void checkIn(h);
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
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">{h.title}</span>
                      {timed && (
                        <span className="block text-[11px] text-faint">{KIND_META[h.kind].label}</span>
                      )}
                    </span>
                  </div>
                  <button
                    onClick={onAction}
                    aria-pressed={doneToday}
                    className={cn(
                      "press shrink-0 rounded-sm border px-3 py-1.5 text-sm font-medium transition-colors",
                      doneToday
                        ? cn("border-transparent text-paper", COLOR[color].bg)
                        : "border-line-strong text-muted hover:border-accent",
                    )}
                  >
                    {label}
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

      {timerHabit && (
        <MeditationTimer
          title={timerHabit.title}
          defaultMinutes={10}
          onDone={(m) => void logMinutes(timerHabit, m)}
          onClose={() => setTimerHabit(null)}
        />
      )}

      {workoutHabit && (
        <WorkoutLog
          title={workoutHabit.title}
          onClose={() => setWorkoutHabit(null)}
          onSave={(m) => {
            void logMinutes(workoutHabit, m);
            setWorkoutHabit(null);
          }}
        />
      )}
    </main>
  );
}

function CreateHabit({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (d: { title: string; icon: string; color: HabitColor; kind: HabitKind }) => void;
}) {
  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState(HABIT_ICON_KEYS[0]);
  const [color, setColor] = useState<HabitColor>("sage");
  const [kind, setKind] = useState<HabitKind>("habit");

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
          <span className="text-sm text-muted">Type</span>
          <div className="grid grid-cols-3 gap-2">
            {HABIT_KINDS.map((k) => {
              const { label, Icon } = KIND_META[k];
              return (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  aria-pressed={kind === k}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-md border py-2.5 text-xs transition-colors",
                    kind === k
                      ? "border-accent bg-accent-tint text-ink"
                      : "border-line text-muted hover:border-accent",
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {label}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-faint">
            {kind === "meditation"
              ? "Opens a timer — sit for as long as you like."
              : kind === "workout"
                ? "Logs the minutes you moved."
                : "A simple one-tap check-in."}
          </p>
        </div>

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
            onClick={() => onCreate({ title: title.trim(), icon, color, kind })}
          >
            Add
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

function WorkoutLog({
  title,
  onClose,
  onSave,
}: {
  title: string;
  onClose: () => void;
  onSave: (minutes: number) => void;
}) {
  const [mins, setMins] = useState(30);
  const PRESETS = [15, 30, 45, 60];

  return (
    <Sheet open onClose={onClose} title={`Log — ${title}`}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => setMins(p)}
              aria-pressed={mins === p}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm transition-colors",
                mins === p ? "border-accent bg-accent-tint text-ink" : "border-line text-muted hover:border-accent",
              )}
            >
              {p}m
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setMins((m) => Math.max(5, m - 5))}
            className="press h-9 w-9 rounded-md border border-line text-muted hover:border-accent"
            aria-label="Less"
          >
            −
          </button>
          <span className="tabular w-16 text-center text-lg font-medium text-ink">{mins} min</span>
          <button
            onClick={() => setMins((m) => Math.min(300, m + 5))}
            className="press h-9 w-9 rounded-md border border-line text-muted hover:border-accent"
            aria-label="More"
          >
            +
          </button>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSave(mins)}>Log {mins} min</Button>
        </div>
      </div>
    </Sheet>
  );
}
