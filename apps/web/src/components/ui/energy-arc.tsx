"use client";

import { useMemo } from "react";
import type { EnergyProfile, EnergyTag } from "@/lib/types";

// The Daily Arc: a calm curve of how today is shaped by the hours you painted
// in Settings, with a live now-marker.
//
// Deliberately deterministic — it reads your energy profile, not a model, so it
// is honest from day one rather than empty until enough history accumulates.
// Solid up to now, dotted for the rest of the day.

const LEVEL: Record<EnergyTag, number> = { deep: 1, shallow: 0.62, admin: 0.38 };
const NEUTRAL = 0.52;

const W = 320;
const H = 84;
const PAD_X = 6;
const PAD_TOP = 10;
const PAD_BOTTOM = 10;

/** "HH:MM-HH:MM" ranges per tag → a tag for each whole hour. */
function hoursFromProfile(profile: EnergyProfile | null): Map<number, EnergyTag> {
  const map = new Map<number, EnergyTag>();
  if (!profile) return map;
  for (const tag of Object.keys(profile) as EnergyTag[]) {
    for (const range of profile[tag] ?? []) {
      const [from, to] = range.split("-");
      if (!from || !to) continue;
      const start = Number(from.split(":")[0]) || 0;
      const end = Number(to.split(":")[0]) || 0;
      for (let h = start; h < end; h++) map.set(h, tag);
    }
  }
  return map;
}

/** Three-point moving average, twice — turns steps into something curve-like. */
function smooth(values: number[]): number[] {
  let out = values;
  for (let pass = 0; pass < 2; pass++) {
    out = out.map((v, i) => {
      const prev = out[i - 1] ?? v;
      const next = out[i + 1] ?? v;
      return (prev + v + next) / 3;
    });
  }
  return out;
}

/** A smooth cubic through every point (control points at the x-midpoints). */
function curvePath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    const cx = (prev.x + cur.x) / 2;
    d += ` C ${cx.toFixed(1)} ${prev.y.toFixed(1)}, ${cx.toFixed(1)} ${cur.y.toFixed(1)}, ${cur.x.toFixed(1)} ${cur.y.toFixed(1)}`;
  }
  return d;
}

function fmtHour(h: number): string {
  const hh = ((h % 24) + 24) % 24;
  if (hh === 12) return "Noon";
  const ampm = hh >= 12 ? "pm" : "am";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}${ampm}`;
}

function fmtClock(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

/** The longest run of consecutive hours carrying `tag`. */
function longestRun(
  hours: Map<number, EnergyTag>,
  tag: EnergyTag,
  from: number,
  to: number,
): [number, number] | null {
  let best: [number, number] | null = null;
  let runStart: number | null = null;
  for (let h = from; h <= to; h++) {
    if (hours.get(h) === tag) {
      if (runStart === null) runStart = h;
      if (h === to && best === null) best = [runStart, h + 1];
    } else if (runStart !== null) {
      const run: [number, number] = [runStart, h];
      if (!best || run[1] - run[0] > best[1] - best[0]) best = run;
      runStart = null;
    }
  }
  if (runStart !== null) {
    const run: [number, number] = [runStart, to + 1];
    if (!best || run[1] - run[0] > best[1] - best[0]) best = run;
  }
  return best;
}

export function EnergyArc({
  energyProfile,
  dayStart,
  dayEnd,
  now,
}: {
  energyProfile: EnergyProfile | null;
  /** Minutes since local midnight. */
  dayStart: number;
  dayEnd: number;
  /** Minutes since local midnight, or -1 before mount (SSR parity). */
  now: number;
}) {
  const model = useMemo(() => {
    const startHour = Math.floor(dayStart / 60);
    const endHour = Math.ceil(dayEnd / 60);
    const hours = hoursFromProfile(energyProfile);

    const samples: number[] = [];
    for (let h = startHour; h <= endHour; h++) {
      const tag = hours.get(h);
      samples.push(tag ? LEVEL[tag] : NEUTRAL);
    }
    const curve = smooth(samples);

    const span = Math.max(1, endHour - startHour);
    const innerW = W - PAD_X * 2;
    const innerH = H - PAD_TOP - PAD_BOTTOM;
    const pts = curve.map((v, i) => ({
      x: PAD_X + (i / span) * innerW,
      y: PAD_TOP + (1 - v) * innerH,
    }));

    const xForMinutes = (m: number) =>
      PAD_X + ((m - startHour * 60) / (span * 60)) * innerW;

    // Interpolate the curve's height at an arbitrary minute, for the now dot.
    const yForMinutes = (m: number) => {
      const t = (m - startHour * 60) / 60; // in hour-index space
      const i = Math.max(0, Math.min(curve.length - 1, Math.floor(t)));
      const j = Math.min(curve.length - 1, i + 1);
      const frac = Math.max(0, Math.min(1, t - i));
      const v = curve[i] + (curve[j] - curve[i]) * frac;
      return PAD_TOP + (1 - v) * innerH;
    };

    const peak = longestRun(hours, "deep", startHour, endHour - 1);
    const settle = longestRun(hours, "admin", startHour, endHour - 1);

    // Evenly spaced hour ticks — 5 reads cleanly at every width.
    const tickCount = 5;
    const ticks = Array.from({ length: tickCount }, (_, i) => {
      const h = Math.round(startHour + (i / (tickCount - 1)) * span);
      return { h, x: xForMinutes(h * 60) };
    });

    return { pts, xForMinutes, yForMinutes, peak, settle, ticks, startHour, endHour };
  }, [energyProfile, dayStart, dayEnd]);

  const path = curvePath(model.pts);
  const started = now >= 0;
  const clamped = Math.max(dayStart, Math.min(now, dayEnd));
  const nowX = started ? model.xForMinutes(clamped) : 0;
  const nowY = started ? model.yForMinutes(clamped) : 0;
  const through =
    started && dayEnd > dayStart
      ? Math.round(((clamped - dayStart) / (dayEnd - dayStart)) * 100)
      : 0;

  return (
    <section
      aria-label="Daily arc"
      className="rounded-lg border border-line bg-surface px-4 py-3"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[11px] font-medium tracking-wide text-muted uppercase">
          Energy flow
        </h2>
        {started && (
          <span className="tabular rounded-pill bg-accent-tint px-2.5 py-1 text-[11px] text-accent-text">
            {fmtClock(clamped)} · {through}% through
          </span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="mt-2 h-24 w-full"
        role="img"
        aria-label={
          model.peak
            ? `Energy peaks between ${fmtHour(model.peak[0])} and ${fmtHour(model.peak[1])}`
            : "Energy through the day"
        }
      >
        <defs>
          {/* Everything left of the now-line is what has already happened. */}
          <clipPath id="arc-elapsed">
            <rect x="0" y="0" width={Math.max(0, nowX)} height={H} />
          </clipPath>
        </defs>

        {/* The rest of the day, held back */}
        <path
          d={path}
          fill="none"
          stroke="var(--color-line-strong)"
          strokeWidth="2"
          strokeDasharray="3 4"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {/* Elapsed, in the one accent colour */}
        {started && (
          <g clipPath="url(#arc-elapsed)">
            <path
              d={path}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="2"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        )}

        {started && (
          <>
            <line
              x1={nowX}
              y1={nowY}
              x2={nowX}
              y2={H - PAD_BOTTOM + 4}
              stroke="var(--color-line-strong)"
              strokeWidth="1"
              strokeDasharray="2 3"
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={nowX} cy={nowY} r="4" fill="var(--color-accent)" />
          </>
        )}
      </svg>

      <div className="tabular flex justify-between text-[10px] text-faint">
        {model.ticks.map((t, i) => (
          <span key={i}>{fmtHour(t.h)}</span>
        ))}
      </div>

      <p className="mt-2 text-[11px] text-faint">
        {model.peak ? (
          <>
            Peak window{" "}
            <span className="text-muted">
              {fmtHour(model.peak[0])} – {fmtHour(model.peak[1])}
            </span>
            {model.settle && (
              <>
                {" · "}Settle at{" "}
                <span className="text-muted">{fmtHour(model.settle[0])}</span>
              </>
            )}
          </>
        ) : (
          <>Paint your energy hours in Settings to shape this.</>
        )}
      </p>
    </section>
  );
}
