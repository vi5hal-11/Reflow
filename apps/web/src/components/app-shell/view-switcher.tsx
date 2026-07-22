"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// The plan has three views — Today (the spine), Week (look ahead), Focus (do
// one thing). A segmented control switches between them; the accent marks the
// active view. This is the v2 restructure: the plan is one thing with modes,
// not scattered screens.
const VIEWS = [
  { href: "/today", label: "Today" },
  { href: "/focus", label: "Focus" },
];

export function ViewSwitcher({ className }: { className?: string }) {
  const pathname = usePathname();
  return (
    <div
      role="tablist"
      aria-label="Plan view"
      className={cn("inline-flex gap-0.5 rounded-sm border border-line p-0.5", className)}
    >
      {VIEWS.map((v) => {
        const active = pathname === v.href;
        return (
          <Link
            key={v.href}
            href={v.href}
            role="tab"
            aria-selected={active}
            className={cn(
              "rounded-md px-3 py-1 text-sm transition-colors",
              active
                ? "bg-accent-tint font-medium text-accent-text"
                : "text-muted hover:text-ink",
            )}
          >
            {v.label}
          </Link>
        );
      })}
    </div>
  );
}
