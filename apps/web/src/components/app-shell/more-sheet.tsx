"use client";

import Link from "next/link";
import {
  CalendarRange,
  FolderKanban,
  LineChart,
  NotebookPen,
  Timer,
} from "lucide-react";
import { Sheet } from "@/components/ui/sheet";

// Everything that isn't a primary tab. These areas existed but were reachable
// only through a header link or the view-switcher — one calm list makes them
// discoverable without crowding the tab bar.
const LINKS = [
  {
    href: "/projects",
    label: "Projects",
    hint: "group tasks into buckets",
    Icon: FolderKanban,
  },
  { href: "/week", label: "Week", hint: "the seven-day look ahead", Icon: CalendarRange },
  { href: "/focus", label: "Focus", hint: "one block at a time", Icon: Timer },
  { href: "/journal", label: "Journal", hint: "today, in your own words", Icon: NotebookPen },
  { href: "/progress", label: "Progress", hint: "gentle patterns over time", Icon: LineChart },
];

export function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  return (
    <Sheet open onClose={onClose} title="More">
      <ul className="flex flex-col gap-1.5">
        {LINKS.map(({ href, label, hint, Icon }) => (
          <li key={href}>
            <Link
              href={href}
              onClick={onClose}
              className="lift flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-3"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-tint text-accent-text">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-sm text-ink">{label}</span>
                <span className="block text-xs text-faint">{hint}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
