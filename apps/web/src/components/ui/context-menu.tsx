"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type MenuItem = {
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  danger?: boolean;
};

// Dependency-free context menu: right-click on desktop, long-press on touch.
// Wraps a row and opens at the pointer; outside-click / Escape / scroll close.
export function ContextMenu({
  items,
  children,
  className,
}: {
  items: MenuItem[];
  children: React.ReactNode;
  className?: string;
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  const open = useCallback(
    (x: number, y: number) => {
      const w = 190;
      const h = items.length * 34 + 8;
      setPos({
        x: Math.min(x, window.innerWidth - w - 8),
        y: Math.min(y, window.innerHeight - h - 8),
      });
    },
    [items.length],
  );

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPos(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [pos]);

  const cancelLong = () => {
    if (longPress.current) {
      clearTimeout(longPress.current);
      longPress.current = null;
    }
  };

  return (
    <div
      className={className}
      onContextMenu={(e) => {
        e.preventDefault();
        open(e.clientX, e.clientY);
      }}
      onPointerDown={(e) => {
        if (e.pointerType !== "touch") return;
        start.current = { x: e.clientX, y: e.clientY };
        longPress.current = setTimeout(() => open(e.clientX, e.clientY), 450);
      }}
      onPointerMove={(e) => {
        if (longPress.current && start.current) {
          const dx = Math.abs(e.clientX - start.current.x);
          const dy = Math.abs(e.clientY - start.current.y);
          if (dx > 8 || dy > 8) cancelLong();
        }
      }}
      onPointerUp={cancelLong}
      onPointerCancel={cancelLong}
    >
      {children}
      {pos && (
        <div
          className="fixed z-[70] min-w-44 rounded-lg border border-line bg-surface py-1 shadow-[var(--shadow-soft)] motion-safe:animate-[toast-in_120ms_var(--ease-out)]"
          style={{ left: pos.x, top: pos.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {items.map((it, i) => (
            <button
              key={i}
              onClick={() => {
                setPos(null);
                it.onSelect();
              }}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent-tint",
                it.danger ? "text-ink" : "text-muted hover:text-ink",
              )}
            >
              {it.icon}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
