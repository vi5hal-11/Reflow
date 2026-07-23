import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Ring } from "@/components/ui/ring";
import { cn } from "@/lib/utils";
import { COLOR, colorOf, habitIcon } from "@/components/habits/habit-meta";

export const metadata = { title: "Progress — Reflow" };

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function windowDays(n: number, end: Date): string[] {
  const out: string[] = [];
  const d = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 12);
  d.setDate(d.getDate() - (n - 1));
  for (let i = 0; i < n; i++) {
    out.push(ymd(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

const MOOD_WORD: Record<number, string> = {
  1: "stormy", 2: "heavy", 3: "even", 4: "clearing", 5: "bright",
};

export default async function ProgressPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const now = new Date();
  const days30 = windowDays(30, now);
  const since = days30[0];

  const [{ data: habits }, { data: logs }, { data: moods }, { data: entries }] =
    await Promise.all([
      supabase
        .from("habits")
        .select("id, title, icon, color, kind")
        .eq("archived", false)
        .order("position", { ascending: true }),
      supabase
        .from("habit_logs")
        .select("habit_id, log_date, minutes")
        .gte("log_date", since),
      supabase.from("mood_logs").select("log_date, mood").gte("log_date", since),
      supabase.from("journal_entries").select("entry_date").gte("entry_date", since),
    ]);

  const habitList = habits ?? [];
  const logList = logs ?? [];
  const moodList = moods ?? [];
  const entryList = entries ?? [];

  const days14 = days30.slice(-14);
  const days7 = days30.slice(-7);
  const in7 = new Set(days7);

  // Per-habit consistency over the last 14 days.
  const logsByHabit = new Map<string, Set<string>>();
  for (const l of logList) {
    if (!logsByHabit.has(l.habit_id)) logsByHabit.set(l.habit_id, new Set());
    logsByHabit.get(l.habit_id)!.add(l.log_date);
  }

  // Mood series over the last 14 days.
  const moodBy = new Map<string, number>();
  for (const m of moodList) moodBy.set(m.log_date, m.mood);
  const moodSeries = days14.map((d) => moodBy.get(d) ?? null);
  const moodVals = moodSeries.filter((v): v is number => v != null);
  const moodAvg = moodVals.length
    ? moodVals.reduce((a, b) => a + b, 0) / moodVals.length
    : null;

  // This-week totals.
  const kindOf = new Map(habitList.map((h) => [h.id, h.kind as string]));
  let meditMin = 0;
  let workoutMin = 0;
  let checkIns = 0;
  for (const l of logList) {
    if (!in7.has(l.log_date)) continue;
    const k = kindOf.get(l.habit_id);
    if (k === "meditation") meditMin += l.minutes ?? 0;
    else if (k === "workout") workoutMin += l.minutes ?? 0;
    else checkIns += 1;
  }
  const entriesThisWeek = entryList.filter((e) => in7.has(e.entry_date)).length;
  const moodsThisWeek = moodList.filter((m) => in7.has(m.log_date)).length;

  // Days active (any wellness action) over 14 days → momentum.
  const activeDays = new Set<string>();
  for (const l of logList) if (days14.includes(l.log_date)) activeDays.add(l.log_date);
  for (const m of moodList) if (days14.includes(m.log_date)) activeDays.add(m.log_date);
  for (const e of entryList) if (days14.includes(e.entry_date)) activeDays.add(e.entry_date);
  const momentum = activeDays.size / 14;

  const tiles = [
    { label: "meditated", value: `${meditMin}m`, color: "violet" as const },
    { label: "moved", value: `${workoutMin}m`, color: "clay" as const },
    { label: "check-ins", value: `${checkIns}`, color: "sage" as const },
    { label: "entries", value: `${entriesThisWeek}`, color: "blue" as const },
    { label: "mood notes", value: `${moodsThisWeek}`, color: "amber" as const },
  ];

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-6 py-10 pb-28 sm:pb-10">
      <header className="flex items-baseline justify-between">
        <div>
          <span className="text-sm text-faint">Reflow</span>
          <h1 className="font-display text-3xl tracking-tight text-ink">Progress</h1>
        </div>
        <div className="flex items-center gap-4 text-sm text-muted">
          <Link href="/habits" className="underline underline-offset-4 hover:text-ink">
            Habits
          </Link>
          <Link href="/journal" className="hidden underline underline-offset-4 hover:text-ink sm:inline">
            Journal
          </Link>
        </div>
      </header>

      <p className="text-sm text-muted">
        A gentle look back — how the last two weeks have flowed. Numbers to
        notice, never to measure up to.
      </p>

      {/* This week */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted">This week</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-lg border border-line bg-surface p-4">
              <span className={cn("font-display text-2xl", COLOR[t.color].text)}>{t.value}</span>
              <span className="mt-0.5 block text-[11px] text-faint">{t.label}</span>
            </div>
          ))}
          <div className="flex items-center gap-3 rounded-lg border border-line bg-surface p-4">
            <Ring value={momentum} size={44}>
              {Math.round(momentum * 100)}
            </Ring>
            <span className="text-[11px] text-faint">
              days showing up
              <br />
              past 14
            </span>
          </div>
        </div>
      </section>

      {/* Mood */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-muted">Mood, last 14 days</h2>
          {moodAvg != null && (
            <span className="text-[11px] text-faint">
              mostly {MOOD_WORD[Math.round(moodAvg)]}
            </span>
          )}
        </div>
        <div className="rounded-lg border border-line bg-surface p-4">
          {moodVals.length === 0 ? (
            <p className="py-6 text-center text-sm text-faint">
              No check-ins yet — the mood card on Habits starts this.
            </p>
          ) : (
            <MoodChart series={moodSeries} />
          )}
        </div>
      </section>

      {/* Habit consistency */}
      {habitList.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted">Consistency, last 14 days</h2>
          <ul className="flex flex-col gap-3">
            {habitList.map((h) => {
              const color = colorOf(h.color);
              const Icon = habitIcon(h.icon);
              const set = logsByHabit.get(h.id) ?? new Set();
              const count = days14.filter((d) => set.has(d)).length;
              const pct = count / 14;
              return (
                <li key={h.id} className="flex items-center gap-3">
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-paper",
                      COLOR[color].bg,
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm text-ink">{h.title}</span>
                      <span className="shrink-0 text-[11px] text-faint">{count} of 14</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-pill bg-line">
                      <div
                        className={cn("h-full rounded-pill", COLOR[color].bg)}
                        style={{ width: `${Math.round(pct * 100)}%` }}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}

// Inline SVG mood line — no chart lib. Values 1..5 mapped to a soft accent
// area; gaps (unlogged days) simply break the line.
function MoodChart({ series }: { series: (number | null)[] }) {
  const W = 100;
  const H = 40;
  const n = series.length;
  const x = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * W);
  const y = (v: number) => H - ((v - 1) / 4) * (H - 6) - 3;

  const pts = series
    .map((v, i) => (v == null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`))
    .filter(Boolean) as string[];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-16 w-full" preserveAspectRatio="none">
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {series.map((v, i) =>
        v == null ? null : (
          <circle key={i} cx={x(i)} cy={y(v)} r="1.6" fill="var(--color-accent)" />
        ),
      )}
    </svg>
  );
}
