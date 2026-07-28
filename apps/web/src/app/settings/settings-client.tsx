"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/section-header";
import { useToast } from "@/components/ui/toast";
import {
  clearBacklog,
  countBacklog,
  freshStartHabits,
  restoreBacklog,
  undoFreshStartHabits,
} from "@/lib/fresh-start";
import {
  blockedWindowColumns,
  energyTags,
  type BlockedWindow,
  type DayProfile,
  type EnergyTag,
  type EnergyProfile,
} from "@/lib/types";

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const WEEKDAYS = [1, 2, 3, 4, 5];

type Brush = EnergyTag | null;

const TAG_LABEL: Record<EnergyTag, string> = {
  deep: "Deep",
  shallow: "Shallow",
  admin: "Admin",
};

// Fill weight (not just hue) distinguishes tags, per DESIGN — sage steps + ink.
const TAG_CELL: Record<EnergyTag, string> = {
  deep: "bg-accent text-paper",
  shallow: "bg-accent-tint text-accent-text",
  admin: "border border-line-strong text-muted",
};

function clockToHour(clock: string): number {
  const [h] = clock.split(":").map(Number);
  return h || 0;
}

function clockToEndHour(clock: string): number {
  const [h, m] = clock.split(":").map(Number);
  return (h || 0) + (m ? 1 : 0);
}

function hhmm(clock: string): string {
  return clock.slice(0, 5);
}

// energy_profile jsonb ("HH:MM-HH:MM" ranges per tag) → per-hour tags.
function profileToHours(profile: EnergyProfile | null): Map<number, EnergyTag> {
  const map = new Map<number, EnergyTag>();
  if (!profile) return map;
  for (const tag of energyTags) {
    for (const range of profile[tag] ?? []) {
      const [from, to] = range.split("-");
      if (!from || !to) continue;
      const startH = clockToHour(from);
      const endH = clockToHour(to);
      for (let h = startH; h < endH; h++) map.set(h, tag);
    }
  }
  return map;
}

// Per-hour tags → merged "HH:00-HH:00" ranges per tag.
function hoursToProfile(hours: Map<number, EnergyTag>): EnergyProfile {
  const out: EnergyProfile = {};
  const sorted = [...hours.entries()].sort((a, b) => a[0] - b[0]);
  for (const tag of energyTags) {
    const ranges: string[] = [];
    let runStart: number | null = null;
    let prev: number | null = null;
    for (const [h, t] of sorted) {
      if (t !== tag) continue;
      if (runStart === null) {
        runStart = h;
      } else if (prev !== null && h !== prev + 1) {
        ranges.push(`${pad(runStart)}:00-${pad(prev + 1)}:00`);
        runStart = h;
      }
      prev = h;
    }
    if (runStart !== null && prev !== null) {
      ranges.push(`${pad(runStart)}:00-${pad(prev + 1)}:00`);
    }
    if (ranges.length) out[tag] = ranges;
  }
  return out;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function hourLabel(h: number): string {
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${ampm}`;
}

export function SettingsClient({
  userId,
  profile,
  initialBlocked,
}: {
  userId: string;
  profile: DayProfile & { display_name: string | null };
  initialBlocked: BlockedWindow[];
}) {
  const supabase = createClient();
  const toast = useToast();

  const [displayName, setDisplayName] = useState(profile.display_name ?? "");
  const [timezone, setTimezone] = useState(profile.timezone);
  const [workStart, setWorkStart] = useState(hhmm(profile.working_hours_start));
  const [workEnd, setWorkEnd] = useState(hhmm(profile.working_hours_end));
  const [buffer, setBuffer] = useState(profile.default_buffer_minutes);
  const [hours, setHours] = useState<Map<number, EnergyTag>>(
    () => profileToHours(profile.energy_profile),
  );
  const [brush, setBrush] = useState<Brush>("deep");
  const [saving, setSaving] = useState(false);
  const paintingRef = useRef(false);

  // Daily caps — empty string means "no cap", which is the default.
  const [maxDeep, setMaxDeep] = useState(
    profile.max_deep_minutes == null ? "" : String(profile.max_deep_minutes),
  );
  const [maxScheduled, setMaxScheduled] = useState(
    profile.max_scheduled_minutes == null ? "" : String(profile.max_scheduled_minutes),
  );

  // Protected time — recurring windows the scheduler must never place into.
  const [blocked, setBlocked] = useState<BlockedWindow[]>(initialBlocked);
  const [bLabel, setBLabel] = useState("");
  const [bStart, setBStart] = useState("12:30");
  const [bEnd, setBEnd] = useState("13:15");
  const [bDays, setBDays] = useState<number[]>(WEEKDAYS);

  const toggleDay = useCallback((d: number) => {
    setBDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort(),
    );
  }, []);

  // --- fresh start ---------------------------------------------------------
  // Coming back after a stretch away. Nothing is deleted: the backlog moves to
  // Later, and habits get a line drawn under their history rather than losing
  // it. Momentum is deliberately untouched (CLAUDE.md §7).
  const [backlog, setBacklog] = useState<number | null>(null);
  const [setAside, setSetAside] = useState<string[] | null>(null);
  const [habitsReset, setHabitsReset] = useState(false);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      const n = await countBacklog(supabase);
      if (alive) setBacklog(n);
    }, 0);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [supabase]);

  const doClearBacklog = useCallback(async () => {
    setWorking(true);
    const { ids, error } = await clearBacklog(supabase);
    setWorking(false);
    if (error) {
      toast("Couldn't clear that — try again.");
      return;
    }
    setSetAside(ids);
    setBacklog(0);
    toast(`${ids.length} set down — they're in Later.`, "accent");
  }, [supabase, toast]);

  const doUndoBacklog = useCallback(async () => {
    const ids = setAside;
    if (!ids) return;
    setSetAside(null);
    if (await restoreBacklog(supabase, ids)) {
      setBacklog(ids.length);
      toast("Put back on today.");
    }
  }, [setAside, supabase, toast]);

  const doFreshHabits = useCallback(async () => {
    setWorking(true);
    const ok = await freshStartHabits(supabase, userId);
    setWorking(false);
    if (!ok) {
      toast("Couldn't do that — try again.");
      return;
    }
    setHabitsReset(true);
    toast("Habit grids count from today.", "accent");
  }, [supabase, userId, toast]);

  const doUndoFreshHabits = useCallback(async () => {
    if (await undoFreshStartHabits(supabase, userId)) {
      setHabitsReset(false);
      toast("Your full history counts again.");
    }
  }, [supabase, userId, toast]);

  const addBlocked = useCallback(async () => {
    const label = bLabel.trim();
    if (!label || bDays.length === 0 || bEnd <= bStart) return;
    const { data, error } = await supabase
      .from("blocked_windows")
      .insert({
        user_id: userId,
        label,
        start_time: bStart,
        end_time: bEnd,
        days_of_week: bDays,
      })
      .select(blockedWindowColumns)
      .single();
    if (error || !data) {
      toast("Couldn't add that — try again.");
      return;
    }
    setBlocked((prev) => [...prev, data as BlockedWindow]);
    setBLabel("");
    toast("Protected. Your next plan works around it.", "accent");
  }, [bLabel, bStart, bEnd, bDays, supabase, userId, toast]);

  const removeBlocked = useCallback(
    async (w: BlockedWindow) => {
      setBlocked((prev) => prev.filter((x) => x.id !== w.id));
      const { error } = await supabase.from("blocked_windows").delete().eq("id", w.id);
      if (error) {
        setBlocked((prev) => [...prev, w]);
        toast("Couldn't remove that — try again.");
      }
    },
    [supabase, toast],
  );

  // The energy grid spans the working window; changing hours re-scopes it.
  const startHour = clockToHour(workStart);
  const endHour = Math.max(clockToEndHour(workEnd), startHour + 1);
  const gridHours = useMemo(
    () => Array.from({ length: endHour - startHour }, (_, i) => startHour + i),
    [startHour, endHour],
  );

  useEffect(() => {
    const stop = () => (paintingRef.current = false);
    window.addEventListener("pointerup", stop);
    return () => window.removeEventListener("pointerup", stop);
  }, []);

  const paint = useCallback(
    (h: number) => {
      setHours((prev) => {
        const next = new Map(prev);
        if (brush === null) next.delete(h);
        else next.set(h, brush);
        return next;
      });
    },
    [brush],
  );

  const save = useCallback(async () => {
    setSaving(true);
    const patch = {
      display_name: displayName.trim() || null,
      timezone,
      working_hours_start: workStart,
      working_hours_end: workEnd,
      default_buffer_minutes: buffer,
      energy_profile: hoursToProfile(hours),
      // Blank = no cap. Clamp so a stray keystroke can't store nonsense.
      max_deep_minutes: maxDeep.trim()
        ? Math.max(0, Math.min(1440, Math.round(Number(maxDeep))))
        : null,
      max_scheduled_minutes: maxScheduled.trim()
        ? Math.max(0, Math.min(1440, Math.round(Number(maxScheduled))))
        : null,
    };
    const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
    setSaving(false);
    if (error) toast("Couldn't save — nothing lost, try again.");
    else toast("Saved. Your next plan uses these.", "accent");
  }, [
    supabase,
    userId,
    displayName,
    timezone,
    workStart,
    workEnd,
    buffer,
    hours,
    maxDeep,
    maxScheduled,
    toast,
  ]);

  const useDeviceTz = () => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) setTimezone(tz);
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-10 px-6 py-10 pb-28 sm:pb-10">
      <header className="flex items-baseline justify-between">
        <div>
          <span className="text-sm text-faint">Reflow</span>
          <h1 className="font-display text-3xl tracking-tight text-ink">Settings</h1>
        </div>
        <nav className="flex items-center gap-4 text-sm text-muted">
          <Link href="/today" className="underline underline-offset-4 hover:text-ink">
            Today
          </Link>
          <Link href="/inbox" className="underline underline-offset-4 hover:text-ink">
            Inbox
          </Link>
        </nav>
      </header>

      {/* Profile */}
      <section className="space-y-4">
        <SectionHeader>You</SectionHeader>
        <label className="block space-y-1.5">
          <span className="text-sm text-muted">Display name</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="what should we call you?"
            className="w-full rounded-sm border border-line-strong bg-transparent px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-accent"
          />
        </label>
        <div className="space-y-1.5">
          <span className="text-sm text-muted">Timezone</span>
          <div className="flex items-center gap-3">
            <span className="rounded-sm border border-line px-3 py-2 text-sm text-ink">
              {timezone}
            </span>
            <Button variant="ghost" size="sm" onClick={useDeviceTz}>
              use this device
            </Button>
          </div>
        </div>
      </section>

      {/* Working window */}
      <section className="space-y-4">
        <SectionHeader aside="the scheduler only places tasks inside this window">
          Your day
        </SectionHeader>
        <div className="flex flex-wrap items-end gap-4">
          <label className="space-y-1.5">
            <span className="block text-sm text-muted">Starts</span>
            <input
              type="time"
              value={workStart}
              onChange={(e) => setWorkStart(e.target.value)}
              className="tabular rounded-sm border border-line-strong bg-transparent px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
          </label>
          <label className="space-y-1.5">
            <span className="block text-sm text-muted">Ends</span>
            <input
              type="time"
              value={workEnd}
              onChange={(e) => setWorkEnd(e.target.value)}
              className="tabular rounded-sm border border-line-strong bg-transparent px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
          </label>
          <label className="space-y-1.5">
            <span className="block text-sm text-muted">Buffer between blocks</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={120}
                step={5}
                value={buffer}
                onChange={(e) =>
                  setBuffer(Math.max(0, Math.min(120, Number(e.target.value) || 0)))
                }
                className="tabular w-20 rounded-sm border border-line-strong bg-transparent px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              />
              <span className="text-sm text-faint">min</span>
            </div>
          </label>
        </div>
      </section>

      {/* Daily caps — ceilings so a day can't be stuffed */}
      <section className="space-y-4">
        <SectionHeader aside="leave blank for no limit">Daily limits</SectionHeader>
        <div className="flex flex-wrap items-end gap-4">
          <label className="space-y-1.5">
            <span className="block text-sm text-muted">Max deep work</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={1440}
                step={15}
                value={maxDeep}
                onChange={(e) => setMaxDeep(e.target.value)}
                placeholder="—"
                className="tabular w-24 rounded-sm border border-line-strong bg-transparent px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              />
              <span className="text-sm text-faint">min / day</span>
            </div>
          </label>
          <label className="space-y-1.5">
            <span className="block text-sm text-muted">Max scheduled</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={1440}
                step={15}
                value={maxScheduled}
                onChange={(e) => setMaxScheduled(e.target.value)}
                placeholder="—"
                className="tabular w-24 rounded-sm border border-line-strong bg-transparent px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              />
              <span className="text-sm text-faint">min / day</span>
            </div>
          </label>
        </div>
        <p className="text-xs text-faint">
          Once a limit is reached the rest waits for tomorrow — it isn&apos;t
          dropped, and nothing is marked overdue. Your Big 3 are always placed,
          limit or not.
        </p>
      </section>

      {/* Protected time — recurring windows the scheduler must never touch */}
      <section className="space-y-4">
        <SectionHeader aside="the scheduler never plans over these">
          Protected time
        </SectionHeader>

        {blocked.length > 0 && (
          <ul className="flex flex-col gap-2">
            {blocked.map((w) => (
              <li
                key={w.id}
                className="flex items-center gap-3 rounded-lg border border-line px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink">{w.label}</span>
                  <span className="tabular block text-[11px] text-faint">
                    {hhmm(w.start_time)}–{hhmm(w.end_time)} ·{" "}
                    {w.days_of_week.length === 7
                      ? "every day"
                      : w.days_of_week
                          .map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d])
                          .join(" ")}
                  </span>
                </div>
                <button
                  onClick={() => void removeBlocked(w)}
                  aria-label={`Remove ${w.label}`}
                  className="shrink-0 rounded-sm px-2 py-1 text-faint hover:text-ink"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-3 rounded-lg border border-line px-4 py-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={bLabel}
              onChange={(e) => setBLabel(e.target.value)}
              placeholder="Lunch, school run, gym…"
              aria-label="What is this time for?"
              className="min-w-0 flex-1 rounded-sm border border-line-strong bg-transparent px-3 py-2.5 text-sm text-ink outline-none placeholder:text-faint focus:border-accent"
            />
            <div className="flex items-center gap-2">
              <input
                type="time"
                value={bStart}
                onChange={(e) => setBStart(e.target.value)}
                aria-label="Starts"
                className="tabular rounded-sm border border-line-strong bg-transparent px-2 py-2 text-sm text-ink outline-none focus:border-accent"
              />
              <span className="text-sm text-faint">to</span>
              <input
                type="time"
                value={bEnd}
                onChange={(e) => setBEnd(e.target.value)}
                aria-label="Ends"
                className="tabular rounded-sm border border-line-strong bg-transparent px-2 py-2 text-sm text-ink outline-none focus:border-accent"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1" role="group" aria-label="Days">
              {DAY_LABELS.map((d, i) => (
                <button
                  key={i}
                  onClick={() => toggleDay(i)}
                  aria-pressed={bDays.includes(i)}
                  aria-label={
                    ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][i]
                  }
                  className={cn(
                    "h-9 w-9 rounded-full border text-xs transition-colors",
                    bDays.includes(i)
                      ? "border-accent bg-accent-tint text-accent-text"
                      : "border-line text-faint hover:border-accent",
                  )}
                >
                  {d}
                </button>
              ))}
            </div>
            <Button
              size="sm"
              className="ml-auto"
              disabled={!bLabel.trim() || bDays.length === 0 || bEnd <= bStart}
              onClick={() => void addBlocked()}
            >
              Protect it
            </Button>
          </div>
        </div>
      </section>

      {/* Energy editor — the marquee control */}
      <section className="space-y-4">
        <SectionHeader aside="paint your hours so deep work lands in your peak">
          Energy
        </SectionHeader>
        <div className="flex flex-wrap gap-2">
          {energyTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setBrush(tag)}
              aria-pressed={brush === tag}
              className={cn(
                "rounded-sm border px-3 py-1.5 text-sm transition-colors",
                brush === tag
                  ? "border-accent text-ink"
                  : "border-line-strong text-muted hover:border-accent",
              )}
            >
              <span
                className={cn(
                  "mr-1.5 inline-block h-2.5 w-2.5 rounded-[3px] align-middle",
                  tag === "deep" && "bg-accent",
                  tag === "shallow" && "bg-accent-tint",
                  tag === "admin" && "border border-line-strong",
                )}
              />
              {TAG_LABEL[tag]}
            </button>
          ))}
          <button
            onClick={() => setBrush(null)}
            aria-pressed={brush === null}
            className={cn(
              "rounded-sm border px-3 py-1.5 text-sm transition-colors",
              brush === null
                ? "border-accent text-ink"
                : "border-line-strong text-muted hover:border-accent",
            )}
          >
            Clear
          </button>
        </div>

        <div
          className="grid gap-1.5"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(56px, 1fr))" }}
        >
          {gridHours.map((h) => {
            const tag = hours.get(h);
            return (
              <button
                key={h}
                onPointerDown={(e) => {
                  e.preventDefault();
                  paintingRef.current = true;
                  paint(h);
                }}
                onPointerEnter={() => {
                  if (paintingRef.current) paint(h);
                }}
                aria-label={`${hourLabel(h)}${tag ? `, ${TAG_LABEL[tag]}` : ", no tag"}`}
                className={cn(
                  "flex h-14 touch-none flex-col items-center justify-center rounded-sm text-xs transition-colors select-none",
                  tag ? TAG_CELL[tag] : "border border-line text-faint hover:border-accent",
                )}
              >
                <span className="tabular font-medium">{hourLabel(h)}</span>
                {tag && <span className="mt-0.5 text-[10px] opacity-80">{TAG_LABEL[tag]}</span>}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-faint">
          Tap or drag across the hours. Leave the rest blank — the scheduler still
          fills them, it just won&apos;t prefer them for that kind of work.
        </p>
      </section>

      {/* Fresh start — the way back in after a stretch away */}
      <section className="space-y-4">
        <SectionHeader aside="nothing is deleted">Fresh start</SectionHeader>

        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-ink">Clear the backlog</p>
            <p className="text-[11px] text-faint">
              {backlog === null
                ? "counting…"
                : backlog === 0
                  ? "Nothing waiting — your day is already clear."
                  : `${backlog} thing${backlog === 1 ? "" : "s"} waiting on today. Moving them to Later takes them off your day without losing them.`}
            </p>
          </div>
          {setAside ? (
            <Button variant="ghost" size="sm" onClick={() => void doUndoBacklog()}>
              Undo
            </Button>
          ) : (
            <Button
              variant="quiet"
              size="sm"
              disabled={working || !backlog}
              onClick={() => void doClearBacklog()}
            >
              Set them down
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-ink">Start habit grids from today</p>
            <p className="text-[11px] text-faint">
              Draws a line under past check-ins. They&apos;re kept, just no longer
              counted — so a long gap stops shaping the grid.
            </p>
          </div>
          {habitsReset ? (
            <Button variant="ghost" size="sm" onClick={() => void doUndoFreshHabits()}>
              Undo
            </Button>
          ) : (
            <Button
              variant="quiet"
              size="sm"
              disabled={working}
              onClick={() => void doFreshHabits()}
            >
              Start fresh
            </Button>
          )}
        </div>

        <p className="text-xs text-faint">
          Your momentum strip is never reset — it dims and recovers on its own.
          &ldquo;You&apos;ve shown up 8 of the last 20 days&rdquo; is only worth
          saying while it&apos;s true.
        </p>
      </section>

      {/* Data */}
      <section className="space-y-3">
        <SectionHeader aside="your data, always yours">Data</SectionHeader>
        <div className="flex items-center gap-3 text-sm">
          <a href="/api/export?format=json" className="underline underline-offset-4 text-muted hover:text-ink">
            Export JSON
          </a>
          <a href="/api/export?format=ical" className="underline underline-offset-4 text-muted hover:text-ink">
            Export iCal
          </a>
        </div>
      </section>

      <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] flex justify-end sm:bottom-4">
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </main>
  );
}
