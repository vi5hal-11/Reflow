"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/section-header";
import { useToast } from "@/components/ui/toast";
import { energyTags, type DayProfile, type EnergyTag, type EnergyProfile } from "@/lib/types";

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
  calendar,
}: {
  userId: string;
  profile: DayProfile & { display_name: string | null };
  calendar: import("@/lib/calendar/types").CalendarStatus;
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
    };
    const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
    setSaving(false);
    if (error) toast("Couldn't save — nothing lost, try again.");
    else toast("Saved. Your next plan uses these.", "accent");
  }, [supabase, userId, displayName, timezone, workStart, workEnd, buffer, hours, toast]);

  const useDeviceTz = () => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) setTimezone(tz);
  };

  const calendarConnected = calendar.available && calendar.connected;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-10 px-6 py-10">
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

      {/* Calendar */}
      {calendar.available && (
        <section className="space-y-3">
          <SectionHeader>Calendar</SectionHeader>
          {calendarConnected ? (
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
              <span>
                Connected
                {calendar.connected && calendar.googleEmail
                  ? ` as ${calendar.googleEmail}`
                  : ""}
                .
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  try {
                    const res = await fetch("/api/calendar/disconnect", { method: "POST" });
                    if (res.ok) {
                      toast("Calendar disconnected.");
                      window.location.reload();
                    }
                  } catch {
                    toast("Couldn't disconnect — try again.");
                  }
                }}
              >
                disconnect
              </Button>
            </div>
          ) : (
            <a href="/api/calendar/connect">
              <Button variant="quiet" size="sm">
                Connect Google Calendar
              </Button>
            </a>
          )}
        </section>
      )}

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

      <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+1rem)] flex justify-end">
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </main>
  );
}
