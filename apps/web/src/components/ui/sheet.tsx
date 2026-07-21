"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

// A lightweight, dependency-free sheet: a bottom sheet on phones (thumb-
// reachable, DESIGN §6), a centered dialog on desktop. Escape and overlay-tap
// close it; focus moves in on open and returns on close. No portal needed —
// a high z-index fixed layer is enough for this app's flat surface.
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const t = setTimeout(() => {
      panelRef.current
        ?.querySelector<HTMLElement>("input, textarea, select, button")
        ?.focus();
    }, 0);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      clearTimeout(t);
      document.body.style.overflow = prevOverflow;
      restoreRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="absolute inset-0 bg-ink/40 motion-safe:animate-[toast-in_150ms_var(--ease-out)]"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className={cn(
          "relative w-full max-w-md rounded-t-lg border border-line bg-surface p-5 shadow-sm",
          "pb-[calc(env(safe-area-inset-bottom)+1.25rem)] sm:rounded-lg sm:pb-5",
          "motion-safe:animate-[sheet-up_220ms_var(--ease-out)]",
        )}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-sm p-1 text-faint hover:text-ink"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
