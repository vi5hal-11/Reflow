"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Inbox, Settings2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

// Bottom tab bar — the mobile shell (DESIGN.md §6). Fixed above the safe-area
// inset, ≥44px targets, hidden on desktop (top nav lives in each header) and on
// the public routes. The sage accent marks the active tab — the one flow.
const TABS = [
  { href: "/today", label: "Today", Icon: CalendarDays },
  { href: "/inbox", label: "Inbox", Icon: Inbox },
  { href: "/habits", label: "Habits", Icon: Sparkles },
  { href: "/settings", label: "Settings", Icon: Settings2 },
];

const APP_ROUTES = ["/today", "/inbox", "/habits", "/journal", "/progress", "/projects", "/settings"];

export function TabBar() {
  const pathname = usePathname();
  if (!APP_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`))) {
    return null;
  }

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      <ul className="mx-auto flex max-w-2xl">
        {TABS.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] transition-colors",
                  active ? "text-accent-text" : "text-faint hover:text-muted",
                )}
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
      </ul>
    </nav>
  );
}
