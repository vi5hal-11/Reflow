"use client";

import { useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { COLOR, colorOf, habitIcon, type HabitKind } from "@/components/habits/habit-meta";
import type { Goal, Habit } from "@/app/habits/habits-client";

// Onboarding: a tiny questionnaire → AI-suggested goals each grouping small
// habits → one tap to add the ones you like. Always produces something (the
// edge and proxy both fall back deterministically), so it never dead-ends.
const FOCUS = [
  { key: "focus", label: "Focus" },
  { key: "health", label: "Health" },
  { key: "calm", label: "Calm" },
  { key: "rest", label: "Rest" },
  { key: "connection", label: "Connection" },
];

type SuggestedHabit = {
  title: string;
  kind: HabitKind;
  icon: string;
  color: string;
  cadence: "daily" | "weekly";
};
type SuggestedGoal = { title: string; color: string; habits: SuggestedHabit[] };

export function GoalOnboard({
  userId,
  basePosition,
  existingTitles,
  onClose,
  onAdded,
}: {
  userId: string;
  basePosition: number;
  existingTitles: string[];
  onClose: () => void;
  onAdded: (goals: Goal[], habits: Habit[]) => void;
}) {
  const supabase = createClient();
  const toast = useToast();
  const [step, setStep] = useState<"form" | "loading" | "review" | "saving">("form");
  const [focus, setFocus] = useState<Set<string>>(new Set(["focus"]));
  const [aspiration, setAspiration] = useState("");
  const [constraints, setConstraints] = useState("");
  const [goals, setGoals] = useState<SuggestedGoal[]>([]);
  const [chosen, setChosen] = useState<Set<number>>(new Set());

  const toggleFocus = (k: string) =>
    setFocus((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const suggest = useCallback(async () => {
    setStep("loading");
    try {
      const res = await fetch("/api/suggest-goals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          focus_areas: [...focus],
          aspiration: aspiration.trim() || null,
          constraints: constraints.trim() || null,
          existing_habits: existingTitles,
        }),
      });
      const data = await res.json();
      const list: SuggestedGoal[] = Array.isArray(data?.goals) ? data.goals : [];
      setGoals(list);
      setChosen(new Set(list.map((_, i) => i)));
      setStep("review");
    } catch {
      toast("Couldn't reach suggestions — add one manually for now.");
      onClose();
    }
  }, [focus, aspiration, constraints, existingTitles, toast, onClose]);

  const commit = useCallback(async () => {
    setStep("saving");
    const picked = goals.filter((_, i) => chosen.has(i));
    const createdGoals: Goal[] = [];
    const createdHabits: Habit[] = [];
    let pos = basePosition;
    for (const g of picked) {
      const { data: goal } = await supabase
        .from("goals")
        .insert({ user_id: userId, title: g.title, color: colorOf(g.color) })
        .select("id, title, color")
        .single();
      if (!goal) continue;
      createdGoals.push(goal as Goal);
      for (const h of g.habits) {
        const { data: habit } = await supabase
          .from("habits")
          .insert({
            user_id: userId,
            goal_id: goal.id,
            title: h.title,
            icon: h.icon,
            color: colorOf(h.color),
            kind: h.kind,
            cadence: h.cadence,
            position: pos++,
          })
          .select("id, title, icon, color, kind, cadence, target_per_week, position, goal_id")
          .single();
        if (habit) createdHabits.push(habit as Habit);
      }
    }
    onAdded(createdGoals, createdHabits);
    toast(`Added ${createdHabits.length} habit${createdHabits.length === 1 ? "" : "s"}.`, "accent");
  }, [goals, chosen, basePosition, supabase, userId, onAdded, toast]);

  const chosenCount = goals
    .filter((_, i) => chosen.has(i))
    .reduce((n, g) => n + g.habits.length, 0);

  return (
    <Sheet open onClose={onClose} title="Shape my goals">
      {step === "form" && (
        <div className="flex flex-col gap-4">
          <div className="space-y-1.5">
            <span className="text-sm text-muted">What would you like more of?</span>
            <div className="flex flex-wrap gap-2">
              {FOCUS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => toggleFocus(f.key)}
                  aria-pressed={focus.has(f.key)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm transition-colors",
                    focus.has(f.key)
                      ? "border-accent bg-accent-tint text-ink"
                      : "border-line text-muted hover:border-accent",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <label className="space-y-1.5">
            <span className="text-sm text-muted">In your words (optional)</span>
            <input
              value={aspiration}
              onChange={(e) => setAspiration(e.target.value)}
              placeholder="e.g. more energy in the mornings"
              className="w-full rounded-sm border border-line-strong bg-transparent px-3 py-2.5 text-sm text-ink outline-none placeholder:text-faint focus:border-accent"
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-sm text-muted">Anything making it hard? (optional)</span>
            <input
              value={constraints}
              onChange={(e) => setConstraints(e.target.value)}
              placeholder="e.g. my evenings are unpredictable"
              className="w-full rounded-sm border border-line-strong bg-transparent px-3 py-2.5 text-sm text-ink outline-none placeholder:text-faint focus:border-accent"
            />
          </label>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={focus.size === 0} onClick={() => void suggest()}>
              Suggest a plan
            </Button>
          </div>
        </div>
      )}

      {(step === "loading" || step === "saving") && (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-accent" />
          <p className="text-sm text-muted">
            {step === "loading" ? "Shaping a gentle plan…" : "Adding them…"}
          </p>
        </div>
      )}

      {step === "review" && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            A starting point — keep what fits, ignore the rest. Nothing here is fixed.
          </p>
          <ul className="flex flex-col gap-3">
            {goals.map((g, i) => {
              const gc = colorOf(g.color);
              const on = chosen.has(i);
              return (
                <li key={i}>
                  <button
                    onClick={() =>
                      setChosen((prev) => {
                        const next = new Set(prev);
                        if (next.has(i)) next.delete(i);
                        else next.add(i);
                        return next;
                      })
                    }
                    aria-pressed={on}
                    className={cn(
                      "w-full rounded-lg border p-3 text-left transition-colors",
                      on ? "border-accent bg-accent-tint/40" : "border-line opacity-60",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn("h-2.5 w-2.5 rounded-full", COLOR[gc].bg)} />
                      <span className="font-medium text-ink">{g.title}</span>
                    </div>
                    <div className="mt-2 flex flex-col gap-1.5">
                      {g.habits.map((h, j) => {
                        const Icon = habitIcon(h.icon);
                        return (
                          <span key={j} className="flex items-center gap-2 text-sm text-muted">
                            <Icon className={cn("h-3.5 w-3.5", COLOR[colorOf(h.color)].text)} aria-hidden />
                            {h.title}
                          </span>
                        );
                      })}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setStep("form")}>
              Back
            </Button>
            <Button disabled={chosenCount === 0} onClick={() => void commit()}>
              Add {chosenCount} habit{chosenCount === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
