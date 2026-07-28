"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { CalendarDays, Inbox, MoreHorizontal, Settings2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { MoreSheet } from "./more-sheet";

// Bottom tab bar — the mobile shell (DESIGN.md §6). Fixed above the safe-area
// inset, ≥44px targets, hidden on desktop (top nav lives in each header) and on
// the public routes. The sage accent marks the active tab — the one flow.
const TABS = [
  { href: "/today", label: "Today", Icon: CalendarDays },
  { href: "/inbox", label: "Inbox", Icon: Inbox },
  { href: "/habits", label: "Habits", Icon: Sparkles },
  { href: "/settings", label: "Settings", Icon: Settings2 },
];

// Routes reachable from the More sheet — the tab bar stays visible on them, and
// the More tab reads as active while you're in one.
const MORE_ROUTES = [
  "/agenda",
  "/review",
  "/projects",
  "/week",
  "/focus",
  "/journal",
  "/progress",
];

const APP_ROUTES = [...TABS.map((t) => t.href), ...MORE_ROUTES];

export function TabBar() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const onAppRoute = APP_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(`${r}/`),
  );
  if (!onAppRoute) return null;

  const inMore = MORE_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(`${r}/`),
  );

  // A short accent rule marks the active tab (mockup 3). It sits above the
  // icon so the label never shifts, and fades rather than sliding — the bar is
  // reached by thumb, and travelling indicators read as lag at that size.
  const itemClass = (active: boolean) =>
    cn(
      "relative flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] transition-colors",
      "before:absolute before:top-0 before:h-0.5 before:rounded-pill before:bg-accent",
      "before:transition-all before:duration-200 before:ease-[var(--ease-out)]",
      active ? "text-accent-text before:w-6 before:opacity-100" : "text-faint hover:text-muted before:w-0 before:opacity-0",
    );

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm sm:hidden"
      >
        <ul className="mx-auto flex max-w-2xl">
          {TABS.map(({ href, label, Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={itemClass(active)}
                >
                  <Icon
                    className={cn("h-5 w-5", active && "text-accent")}
                    strokeWidth={active ? 2.2 : 1.8}
                    aria-hidden
                  />
                  {label}
                </Link>
              </li>
            );
          })}
          <li className="flex-1">
            <button
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              className={itemClass(inMore)}
            >
              <MoreHorizontal
                className={cn("h-5 w-5", inMore && "text-accent")}
                strokeWidth={inMore ? 2.2 : 1.8}
                aria-hidden
              />
              More
            </button>
          </li>
        </ul>
      </nav>

      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  );
}
