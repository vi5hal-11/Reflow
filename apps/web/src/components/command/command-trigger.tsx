"use client";

import { Command } from "lucide-react";
import { cn } from "@/lib/utils";

// The visible "command bar" (v2). A slim, always-present control that opens the
// ⌘K palette — the app's spine, and the way in on touch (no keyboard). Fires
// the same event the ⌘K shortcut does.
function openPalette() {
  window.dispatchEvent(new CustomEvent("reflow:cmdk"));
}

export function CommandBar({ className }: { className?: string }) {
  return (
    <button
      onClick={openPalette}
      className={cn(
        "flex w-full items-center gap-2 rounded-sm border border-line-strong bg-transparent px-3 py-2 text-sm text-faint transition-colors hover:border-accent",
        className,
      )}
    >
      <Command className="h-3.5 w-3.5" aria-hidden />
      <span>Add a task or run a command</span>
      <kbd className="tabular ml-auto hidden rounded border border-line px-1.5 text-[11px] sm:inline">
        ⌘K
      </kbd>
    </button>
  );
}

// A compact icon-only trigger for tight headers / mobile.
export function CommandIconButton({ className }: { className?: string }) {
  return (
    <button
      onClick={openPalette}
      aria-label="Open command menu"
      className={cn("rounded-sm p-2 text-muted hover:text-ink", className)}
    >
      <Command className="h-4 w-4" aria-hidden />
    </button>
  );
}
