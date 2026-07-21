import { cn } from "@/lib/utils";

// "Whisper & Settle" empty state (DESIGN.md §7): one calm line + one optional
// quiet action. Warmth from copy and the accent, not illustration.
export function EmptyState({
  title,
  hint,
  action,
  className,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 px-6 py-12 text-center",
        className,
      )}
    >
      <p className="text-sm text-ink">{title}</p>
      {hint ? <p className="max-w-xs text-sm text-faint">{hint}</p> : null}
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
