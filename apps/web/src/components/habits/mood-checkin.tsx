"use client";

import { useCallback, useState } from "react";
import { Cloud, CloudLightning, CloudRain, CloudSun, Sun, type LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { COLOR, type HabitColor } from "@/components/habits/habit-meta";

// Daily mood check-in — a calm weather metaphor, not a graded face scale
// (faces read as "how well did you perform"; weather just names the day). One
// tap upserts today's mood; the note is optional and feeds the reflection edge.
type Weather = { value: number; label: string; Icon: LucideIcon; color: HabitColor };

const SCALE: Weather[] = [
  { value: 1, label: "Storm", Icon: CloudLightning, color: "clay" },
  { value: 2, label: "Rain", Icon: CloudRain, color: "blue" },
  { value: 3, label: "Cloud", Icon: Cloud, color: "teal" },
  { value: 4, label: "Clearing", Icon: CloudSun, color: "sage" },
  { value: 5, label: "Sun", Icon: Sun, color: "amber" },
];

const ACK: Record<number, string> = {
  1: "Rough one. Noticing it is enough today.",
  2: "Heavy going. Be gentle with the plan.",
  3: "An even keel. That counts.",
  4: "Some light breaking through.",
  5: "A bright one — glad it landed.",
};

export function MoodCheckin({
  userId,
  today,
  initialMood,
  initialNote,
}: {
  userId: string;
  today: string;
  initialMood: number | null;
  initialNote: string | null;
}) {
  const supabase = createClient();
  const [mood, setMood] = useState<number | null>(initialMood);
  const [note, setNote] = useState(initialNote ?? "");
  const [noteOpen, setNoteOpen] = useState(false);

  const save = useCallback(
    async (nextMood: number, nextNote: string) => {
      await supabase.from("mood_logs").upsert(
        {
          user_id: userId,
          log_date: today,
          mood: nextMood,
          note: nextNote.trim() || null,
        },
        { onConflict: "user_id,log_date" },
      );
    },
    [supabase, userId, today],
  );

  const pick = useCallback(
    (value: number) => {
      setMood(value);
      setNoteOpen(true);
      void save(value, note);
    },
    [note, save],
  );

  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-ink">How&rsquo;s today feeling?</h2>
        {mood !== null && (
          <span className="text-[11px] text-faint">{ACK[mood]}</span>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        {SCALE.map(({ value, label, Icon, color }) => {
          const active = mood === value;
          return (
            <button
              key={value}
              onClick={() => pick(value)}
              aria-pressed={active}
              aria-label={label}
              className={cn(
                "press flex flex-1 flex-col items-center gap-1 rounded-md border py-2.5 transition-colors",
                active
                  ? cn("border-transparent text-paper", COLOR[color].bg)
                  : "border-line text-muted hover:border-accent",
              )}
            >
              <Icon className="h-5 w-5" aria-hidden />
              <span className="text-[10px]">{label}</span>
            </button>
          );
        })}
      </div>

      {(noteOpen || note) && mood !== null && (
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => void save(mood, note)}
          placeholder="A word on why, if you like…"
          className="mt-3 w-full rounded-sm border border-line bg-transparent px-3 py-2 text-sm text-ink outline-none placeholder:text-faint focus:border-accent"
        />
      )}
    </section>
  );
}
