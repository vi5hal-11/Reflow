"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { SunHorizon } from "@/components/ui/sun-horizon";

const KEY = "reflow_welcomed";

const STEPS = [
  { href: "/inbox", n: "1", label: "Capture anything", hint: "dump it, no fields" },
  { href: "/settings", n: "2", label: "Set your energy", hint: "paint your peak hours" },
  { href: "/today?plan=1", n: "3", label: "Plan my day", hint: "it flows around you" },
];

// First-run welcome — a sub-60s, skippable guide to the three-step aha. Shown
// once ever (localStorage), so returning users never see it.
export function Welcome() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (!localStorage.getItem(KEY)) setShow(true);
      } catch {
        /* private mode — just skip the welcome */
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  if (!show) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    setShow(false);
  };

  return (
    <section className="relative overflow-hidden rounded-lg border border-accent-tint bg-accent-tint/40 p-5">
      <button
        onClick={dismiss}
        aria-label="Dismiss welcome"
        className="absolute right-3 top-3 rounded-sm p-1 text-faint transition-colors hover:text-ink"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>

      <div className="flex items-center gap-3">
        <SunHorizon className="h-10 shrink-0" />
        <div>
          <h2 className="font-display text-lg text-ink">Welcome to Reflow</h2>
          <p className="text-sm text-muted">Three steps to your first calm day.</p>
        </div>
      </div>

      <ol className="mt-4 grid gap-2 sm:grid-cols-3">
        {STEPS.map((s) => (
          <li key={s.n}>
            <Link
              href={s.href}
              onClick={dismiss}
              className="lift flex h-full flex-col gap-0.5 rounded-md border border-line bg-surface px-3 py-2.5"
            >
              <span className="text-xs font-medium text-accent-text">Step {s.n}</span>
              <span className="text-sm text-ink">{s.label}</span>
              <span className="text-xs text-faint">{s.hint}</span>
            </Link>
          </li>
        ))}
      </ol>

      <button
        onClick={dismiss}
        className="mt-4 text-xs text-muted underline underline-offset-4 transition-colors hover:text-ink"
      >
        skip for now
      </button>
    </section>
  );
}
