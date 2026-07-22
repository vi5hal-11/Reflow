import { cn } from "@/lib/utils";

// A calm circular progress ring — the accent arc on a tint track. Used for
// day-completion and Focus time-remaining. Graphics, not chrome: it replaces a
// flat "4/6" with something glanceable.
export function Ring({
  value,
  size = 44,
  stroke = 4,
  className,
  children,
}: {
  value: number; // 0..1
  size?: number;
  stroke?: number;
  className?: string;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(1, value)));
  return (
    <div
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent-tint)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={off}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      {children != null && (
        <span className="tabular absolute text-[11px] font-medium text-muted">{children}</span>
      )}
    </div>
  );
}

// A gentle horizontal workload/progress meter — never red (a full day is
// "full", not a failure).
export function Meter({
  value,
  className,
}: {
  value: number; // 0..1 (clamped)
  className?: string;
}) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className={cn("h-1.5 overflow-hidden rounded-pill bg-accent-tint", className)}>
      <div
        className="h-full rounded-pill bg-accent transition-[width] duration-700 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
