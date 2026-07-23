"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export type JournalEntry = { entry_date: string; body: string };

function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function longDate(s: string): string {
  return parseYmd(s).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}
function shortDate(s: string): string {
  return parseYmd(s).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const PROMPTS = [
  "What actually happened today?",
  "What took more out of you than you expected?",
  "One thing that went quietly right…",
  "What are you carrying into tomorrow?",
];

export function JournalClient({
  userId,
  today,
  initialEntries,
}: {
  userId: string;
  today: string;
  initialEntries: JournalEntry[];
}) {
  const supabase = createClient();

  // entries kept as a map date -> body, seeded from the server load.
  const [entries, setEntries] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const e of initialEntries) m[e.entry_date] = e.body;
    return m;
  });
  const [selected, setSelected] = useState(today);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const body = entries[selected] ?? "";
  const prompt = useMemo(
    () => PROMPTS[Math.abs(hashDate(selected)) % PROMPTS.length],
    [selected],
  );

  const save = useCallback(
    async (date: string, text: string) => {
      setSaveState("saving");
      await supabase.from("journal_entries").upsert(
        { user_id: userId, entry_date: date, body: text },
        { onConflict: "user_id,entry_date" },
      );
      setSaveState("saved");
    },
    [supabase, userId],
  );

  const onChange = useCallback(
    (text: string) => {
      setEntries((prev) => ({ ...prev, [selected]: text }));
      setSaveState("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void save(selected, text), 800);
    },
    [selected, save],
  );

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    void save(selected, entries[selected] ?? "");
  }, [selected, entries, save]);

  const stepDay = useCallback(
    (delta: number) => {
      flush();
      const d = parseYmd(selected);
      d.setDate(d.getDate() + delta);
      const next = ymd(d);
      if (next > today) return; // never journal into the future
      setSelected(next);
      setSaveState("idle");
    },
    [selected, today, flush],
  );

  const recent = useMemo(
    () =>
      Object.entries(entries)
        .filter(([d, b]) => b.trim() && d !== selected)
        .sort((a, b) => (a[0] < b[0] ? 1 : -1))
        .slice(0, 12),
    [entries, selected],
  );

  const isToday = selected === today;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-6 py-10 pb-28 sm:pb-10">
      <header className="flex items-baseline justify-between">
        <div>
          <span className="text-sm text-faint">Reflow</span>
          <h1 className="font-display text-3xl tracking-tight text-ink">Journal</h1>
        </div>
        <Link
          href="/habits"
          className="hidden text-sm text-muted underline underline-offset-4 hover:text-ink sm:inline"
        >
          Habits
        </Link>
      </header>

      <section className="rounded-lg border border-line bg-surface p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => stepDay(-1)}
              aria-label="Previous day"
              className="press rounded-sm border border-line px-2 py-1 text-sm text-muted hover:border-accent"
            >
              ←
            </button>
            <button
              onClick={() => stepDay(1)}
              disabled={isToday}
              aria-label="Next day"
              className="press rounded-sm border border-line px-2 py-1 text-sm text-muted enabled:hover:border-accent disabled:opacity-40"
            >
              →
            </button>
            <span className="text-sm font-medium text-ink">
              {isToday ? "Today" : longDate(selected)}
            </span>
          </div>
          <span className="text-[11px] text-faint">
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : ""}
          </span>
        </div>

        <textarea
          value={body}
          onChange={(e) => onChange(e.target.value)}
          onBlur={flush}
          placeholder={prompt}
          rows={10}
          className="mt-4 w-full resize-none bg-transparent text-[15px] leading-relaxed text-ink outline-none placeholder:text-faint"
        />
        <p className="mt-1 text-[11px] text-faint">
          Yours alone. No streak, no wordcount, no pressure — write a line or nothing at all.
        </p>
      </section>

      {recent.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted">Earlier</h2>
          <ul className="flex flex-col gap-2">
            {recent.map(([date, text]) => (
              <li key={date}>
                <button
                  onClick={() => {
                    flush();
                    setSelected(date);
                    setSaveState("idle");
                  }}
                  className={cn(
                    "lift w-full rounded-lg border border-line bg-surface p-3 text-left",
                  )}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium text-ink">{shortDate(date)}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted">{text}</p>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function hashDate(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
