"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, X } from "lucide-react";
import { cn } from "@/lib/utils";

// A calm full-screen meditation timer. Pick a length, breathe, and on
// completion it hands the minutes back to be logged. No countdown urgency —
// a single soft ring easing toward done. Deliberately quiet.
const PRESETS = [5, 10, 15, 20, 30];

export function MeditationTimer({
  title,
  defaultMinutes,
  onDone,
  onClose,
}: {
  title: string;
  defaultMinutes: number;
  onDone: (minutes: number) => void;
  onClose: () => void;
}) {
  const initial = PRESETS.includes(defaultMinutes) ? defaultMinutes : 10;
  const [minutes, setMinutes] = useState(initial);
  const [remaining, setRemaining] = useState(initial * 60);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const remainingRef = useRef(initial * 60);

  // Tick once per second while running. All state changes happen inside the
  // interval callback (an external-system callback), never synchronously in the
  // effect body — and completion fires exactly once, then clears the interval.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      remainingRef.current = Math.max(0, remainingRef.current - 1);
      setRemaining(remainingRef.current);
      if (remainingRef.current === 0) {
        clearInterval(id);
        setRunning(false);
        setFinished(true);
        onDone(minutes);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [running, minutes, onDone]);

  const choose = useCallback((p: number) => {
    setMinutes(p);
    remainingRef.current = p * 60;
    setRemaining(p * 60);
  }, []);

  const toggle = useCallback(() => setRunning((r) => !r), []);

  const total = minutes * 60;
  const progress = total > 0 ? 1 - remaining / total : 0;
  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");

  const R = 130;
  const C = 2 * Math.PI * R;

  return (
    <div
      className="fixed inset-0 z-60 flex flex-col items-center justify-center bg-paper px-6 motion-safe:animate-[toast-in_160ms_var(--ease-out)]"
      role="dialog"
      aria-modal="true"
      aria-label={`Meditation timer — ${title}`}
    >
      <button
        onClick={onClose}
        aria-label="Close"
        className="press absolute right-5 top-5 rounded-full border border-line p-2 text-muted hover:border-accent"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>

      <span className="text-sm text-faint">{title}</span>

      <div className="relative mt-6 flex items-center justify-center">
        <svg width="300" height="300" viewBox="0 0 300 300" className="-rotate-90">
          <circle cx="150" cy="150" r={R} fill="none" stroke="var(--color-line)" strokeWidth="6" />
          <circle
            cx="150"
            cy="150"
            r={R}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - progress)}
            className="transition-[stroke-dashoffset] duration-1000 ease-linear"
          />
        </svg>
        <div className="absolute flex flex-col items-center">
          <span className="font-display text-5xl tabular text-ink">
            {finished ? "done" : `${mm}:${ss}`}
          </span>
          {finished && (
            <span className="mt-1 text-sm text-muted">{minutes} min. Well sat.</span>
          )}
        </div>
      </div>

      {!finished && (
        <>
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            {PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => choose(p)}
                disabled={running}
                aria-pressed={minutes === p}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm transition-colors disabled:opacity-40",
                  minutes === p
                    ? "border-accent bg-accent-tint text-ink"
                    : "border-line text-muted enabled:hover:border-accent",
                )}
              >
                {p}m
              </button>
            ))}
          </div>

          <button
            onClick={toggle}
            className="press mt-8 flex h-14 w-14 items-center justify-center rounded-full border border-accent-strong bg-accent text-paper shadow-[var(--shadow-soft)]"
            aria-label={running ? "Pause" : "Start"}
          >
            {running ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 translate-x-0.5" />}
          </button>
        </>
      )}

      {finished && (
        <button
          onClick={onClose}
          className="press mt-8 rounded-sm border border-accent-strong bg-accent px-5 py-2.5 text-sm font-medium text-paper shadow-[var(--shadow-soft)]"
        >
          Close
        </button>
      )}
    </div>
  );
}
