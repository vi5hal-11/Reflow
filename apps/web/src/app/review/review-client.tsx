"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { ArrowRight, Check, Sunrise } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SunHorizon } from "@/components/ui/sun-horizon";
import { useToast } from "@/components/ui/toast";
import type { DayTask, MomentumDay } from "@/lib/types";

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function shift(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return ymd(d);
}

export function ReviewClient({
  userId,
  initialTasks,
  momentum,
}: {
  userId: string;
  initialTasks: DayTask[];
  momentum: MomentumDay[];
}) {
  const supabase = createClient();
  const toast = useToast();
  const [tasks, setTasks] = useState<DayTask[]>(initialTasks);
  const [reflection, setReflection] = useState<{
    insight: string;
    pattern: string | null;
    encouragement: string;
  } | null>(null);
  const [reflecting, setReflecting] = useState(false);
  const [reflectNotice, setReflectNotice] = useState<string | null>(null);

  const today = ymd(new Date());
  const tomorrow = shift(1);
  // Sunday is when a week is actually over — that's when the wider look back earns its place.
  const isWeekEnd = new Date().getDay() === 0;

  const patch = useCallback((id: string, p: Partial<DayTask>) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...p } : t)));
  }, []);

  const todays = useMemo(
    () => tasks.filter((t) => t.planned_date === today && !t.is_optional),
    [tasks, today],
  );
  const doneToday = todays.filter((t) => t.status === "done");
  const unfinished = todays.filter((t) => t.status !== "done");
  const big3Today = todays.filter((t) => t.is_big3);
  const big3Landed = big3Today.length > 0 && big3Today.every((t) => t.status === "done");

  const tomorrows = useMemo(
    () => tasks.filter((t) => t.planned_date === tomorrow && t.status !== "done"),
    [tasks, tomorrow],
  );
  const tomorrowBig3 = tomorrows.filter((t) => t.is_big3);

  // --- week (Sundays) --------------------------------------------------------
  const week = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => shift(-6 + i));
    const set = new Set(days);
    const doneThisWeek = tasks.filter(
      (t) => t.status === "done" && t.planned_date && set.has(t.planned_date),
    ).length;
    const active = momentum.filter((m) => set.has(m.metric_date) && m.active).length;
    const rest = momentum.filter((m) => set.has(m.metric_date) && !m.active).length;
    return { doneThisWeek, active, rest, days };
  }, [tasks, momentum]);

  // --- actions ---------------------------------------------------------------
  const carryToTomorrow = useCallback(
    async (task: DayTask) => {
      patch(task.id, { planned_date: tomorrow, status: "todo", scheduled_start: null, scheduled_end: null });
      const { error } = await supabase
        .from("tasks")
        .update({
          planned_date: tomorrow,
          status: "todo",
          scheduled_start: null,
          scheduled_end: null,
        })
        .eq("id", task.id);
      if (error) {
        patch(task.id, { planned_date: today, status: task.status });
        toast("Couldn't move that — try again.");
      }
    },
    [supabase, patch, tomorrow, today, toast],
  );

  const letGo = useCallback(
    async (task: DayTask) => {
      patch(task.id, { planned_date: null, status: "todo", is_big3: false });
      const { error } = await supabase
        .from("tasks")
        .update({ planned_date: null, status: "todo", is_big3: false })
        .eq("id", task.id);
      if (error) {
        patch(task.id, { planned_date: today, status: task.status });
        toast("Couldn't move that — try again.");
      }
    },
    [supabase, patch, today, toast],
  );

  const carryAll = useCallback(async () => {
    if (unfinished.length === 0) return;
    const ids = unfinished.map((t) => t.id);
    setTasks((prev) =>
      prev.map((t) =>
        ids.includes(t.id)
          ? { ...t, planned_date: tomorrow, status: "todo", scheduled_start: null, scheduled_end: null }
          : t,
      ),
    );
    await supabase
      .from("tasks")
      .update({
        planned_date: tomorrow,
        status: "todo",
        scheduled_start: null,
        scheduled_end: null,
      })
      .in("id", ids);
    toast(`${ids.length} moved to tomorrow.`, "accent");
  }, [unfinished, supabase, tomorrow, toast]);

  const toggleTomorrowBig3 = useCallback(
    async (task: DayTask) => {
      const isIn = task.is_big3;
      if (!isIn && tomorrowBig3.length >= 3) return;
      const next = tomorrows.filter((t) =>
        t.id === task.id ? !isIn : t.is_big3,
      );
      patch(task.id, { is_big3: !isIn });
      const [{ error: taskError }] = await Promise.all([
        supabase.from("tasks").update({ is_big3: !isIn }).eq("id", task.id),
        supabase.from("daily_plans").upsert(
          {
            user_id: userId,
            plan_date: tomorrow,
            big3_task_ids: next.map((t) => t.id),
          },
          { onConflict: "user_id,plan_date" },
        ),
      ]);
      if (taskError) {
        patch(task.id, { is_big3: isIn });
        toast("Couldn't save — try again.");
      }
    },
    [tomorrows, tomorrowBig3.length, patch, supabase, userId, tomorrow, toast],
  );

  const reflect = useCallback(async () => {
    setReflecting(true);
    setReflectNotice(null);
    try {
      const res = await fetch("/api/reflect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          date: today,
          meetings: todays.filter((t) => t.is_fixed).length,
          showed_up_days: week.active,
          window_days: 7,
          tasks: todays.slice(0, 100).map((t) => ({
            title: t.title,
            status: (t.status === "inbox" ? "todo" : t.status) as
              | "done"
              | "scheduled"
              | "todo"
              | "rolled",
            energy_tag: t.energy_tag,
            estimated_minutes: t.estimated_minutes,
            actual_minutes: null,
            was_big3: t.is_big3,
          })),
        }),
      });
      if (!res.ok) {
        setReflectNotice("Reflection isn't available right now — the day still counts.");
        return;
      }
      setReflection(await res.json());
    } catch {
      setReflectNotice("Reflection isn't available right now — the day still counts.");
    } finally {
      setReflecting(false);
    }
  }, [today, todays, week.active]);

  const stepLabel = "text-[11px] font-medium tracking-wide text-muted uppercase";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-8 px-6 py-10 pb-28 sm:pb-10">
      <header className="flex items-baseline justify-between">
        <div>
          <span className="text-sm text-faint">Reflow</span>
          <h1 className="font-display text-3xl tracking-tight text-ink">
            {isWeekEnd ? "The week, gently" : "Closing the day"}
          </h1>
        </div>
        <Link
          href="/today"
          className="text-sm text-muted underline underline-offset-4 hover:text-ink"
        >
          Today
        </Link>
      </header>

      {/* 1 — how today went */}
      <section aria-label="How today went" className="space-y-3">
        <h2 className={stepLabel}>How today went</h2>

        {big3Landed ? (
          <div className="flex items-center gap-3 rounded-lg border border-accent-tint bg-accent-tint px-4 py-3">
            <SunHorizon className="h-9 shrink-0" />
            <p className="text-sm text-accent-text">
              <span className="font-display">Your Big 3 landed.</span> That&apos;s the
              day, whatever else moved.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-line px-4 py-3">
            <p className="text-sm text-ink">
              {doneToday.length} of {todays.length} finished
              {big3Today.length > 0 &&
                ` · ${big3Today.filter((t) => t.status === "done").length} of your Big 3`}
              .
            </p>
            <p className="mt-0.5 text-[11px] text-faint">
              {doneToday.length === 0
                ? "Some days are just holding on. That counts too."
                : "Whatever's left simply moves — nothing here is overdue."}
            </p>
          </div>
        )}

        {reflection ? (
          <div className="space-y-1.5 rounded-lg border border-line px-4 py-3 text-sm">
            <p className="text-ink">{reflection.insight}</p>
            {reflection.pattern && <p className="text-muted">{reflection.pattern}</p>}
            <p className="text-faint">{reflection.encouragement}</p>
          </div>
        ) : (
          <div>
            <Button variant="quiet" size="sm" onClick={() => void reflect()} disabled={reflecting}>
              {reflecting ? "looking back…" : "Look back on today"}
            </Button>
            {reflectNotice && (
              <p className="mt-2 text-xs text-faint">{reflectNotice}</p>
            )}
          </div>
        )}
      </section>

      {/* 2 — carrying over */}
      <section aria-label="Carrying into tomorrow" className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className={stepLabel}>Carrying into tomorrow</h2>
          {unfinished.length > 1 && (
            <button
              onClick={() => void carryAll()}
              className="text-xs text-accent-text underline underline-offset-4"
            >
              move all {unfinished.length}
            </button>
          )}
        </div>

        {unfinished.length === 0 ? (
          <p className="rounded-lg border border-line px-4 py-3 text-sm text-muted">
            Nothing left over. A clean finish.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {unfinished.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-2 rounded-lg border border-line px-3 py-2.5 text-sm"
              >
                <span className="min-w-0 flex-1 truncate text-ink">
                  {t.is_big3 && <span className="text-accent">★ </span>}
                  {t.title}
                </span>
                <button
                  onClick={() => void carryToTomorrow(t)}
                  className="shrink-0 rounded-sm border border-line-strong px-2 py-1 text-xs text-ink hover:border-accent"
                >
                  Tomorrow
                </button>
                <button
                  onClick={() => void letGo(t)}
                  title="Back to Later — it'll be there when you want it"
                  className="shrink-0 rounded-sm px-2 py-1 text-xs text-faint hover:text-ink"
                >
                  Let go
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 3 — tomorrow */}
      <section aria-label="Tomorrow" className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className={stepLabel}>Tomorrow&apos;s Big 3</h2>
          <span className="text-xs text-faint">{tomorrowBig3.length} of 3 chosen</span>
        </div>

        {tomorrows.length === 0 ? (
          <p className="rounded-lg border border-line px-4 py-3 text-sm text-muted">
            Nothing lined up yet. Move something over, or capture it in the{" "}
            <Link href="/inbox" className="underline underline-offset-4">
              inbox
            </Link>
            .
          </p>
        ) : (
          <>
            <p className="text-[11px] text-faint">
              Star up to three that would make tomorrow feel good.
            </p>
            <ul className="flex flex-col gap-2">
              {tomorrows.map((t) => {
                const full = !t.is_big3 && tomorrowBig3.length >= 3;
                return (
                  <li
                    key={t.id}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm",
                      t.is_big3 ? "border-accent" : "border-line",
                    )}
                  >
                    <button
                      onClick={() => void toggleTomorrowBig3(t)}
                      disabled={full}
                      aria-label={t.is_big3 ? "Remove from tomorrow's Big 3" : "Add to tomorrow's Big 3"}
                      className={cn(
                        "shrink-0 px-1 text-sm",
                        t.is_big3 ? "text-accent" : "text-faint hover:text-accent",
                        full && "cursor-default opacity-40",
                      )}
                    >
                      {t.is_big3 ? "★" : "☆"}
                    </button>
                    <span className="min-w-0 flex-1 truncate text-ink">{t.title}</span>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        <Link href="/today?plan=1" className="inline-block">
          <Button variant="quiet" size="sm">
            <Sunrise className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Plan it in the morning
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" aria-hidden />
          </Button>
        </Link>
      </section>

      {/* Weekly — only when a week has actually closed */}
      {isWeekEnd && (
        <section aria-label="This week" className="space-y-3">
          <h2 className={stepLabel}>This week</h2>
          <div className="rounded-lg border border-line px-4 py-3">
            <p className="text-sm text-ink">
              You showed up {week.active} of the last 7 days
              {week.rest > 0 && ` · ${week.rest} rest`} and finished{" "}
              {week.doneThisWeek} thing{week.doneThisWeek === 1 ? "" : "s"}.
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-faint">
              Not a score — just the shape of the week. If one part of it felt
              heavier than it needed to, that&apos;s the thing worth changing,
              and one small change is plenty.
            </p>
          </div>
          <div className="flex items-center gap-1.5" aria-hidden>
            {week.days.map((d) => {
              const m = momentum.find((x) => x.metric_date === d);
              return (
                <span
                  key={d}
                  title={d}
                  className={cn(
                    "h-2.5 flex-1 rounded-pill",
                    m?.active ? "bg-accent" : m ? "border border-line-strong" : "bg-line",
                  )}
                />
              );
            })}
          </div>
        </section>
      )}

      <p className="mt-auto pt-6 text-center text-xs text-faint">
        <Check className="mr-1 inline h-3 w-3" aria-hidden />
        nothing here is overdue · tomorrow starts fresh
      </p>
    </main>
  );
}
