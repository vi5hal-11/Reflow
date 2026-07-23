"use client";

import { useEffect } from "react";

// A calm completion micro-moment (CLAUDE.md §7). Three sage rings ease outward
// and fade behind a soft rising word — no confetti, no score, no streak count.
// Non-blocking (pointer-events-none) and self-dismissing. Reduced-motion keeps
// only the word's gentle fade; the rings are motion-safe.
export function Celebration({
  message,
  onDone,
}: {
  message: string;
  onDone: () => void;
}) {
  useEffect(() => {
    const id = setTimeout(onDone, 1500);
    return () => clearTimeout(id);
  }, [onDone]);

  return (
    <div
      className="pointer-events-none fixed inset-0 z-70 flex items-center justify-center"
      aria-live="polite"
      role="status"
    >
      <div className="relative flex items-center justify-center">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="absolute h-24 w-24 rounded-full border border-accent motion-safe:animate-[celebrate-ring_1.4s_var(--ease-out)_forwards]"
            style={{ animationDelay: `${i * 160}ms` }}
          />
        ))}
        <span className="motion-safe:animate-[celebrate-word_1.5s_var(--ease-out)_forwards] rounded-full border border-accent-strong bg-surface/90 px-4 py-1.5 text-sm font-medium text-ink shadow-[var(--shadow-soft)] backdrop-blur-sm">
          {message}
        </span>
      </div>
    </div>
  );
}
