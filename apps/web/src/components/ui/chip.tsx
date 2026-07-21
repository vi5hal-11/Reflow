import { cn } from "@/lib/utils";

// A small metadata pill (duration, energy tag, deadline, project, age).
// One home for the shape used across inbox, today, and settings.
export function Chip({
  children,
  tone = "default",
  className,
}: {
  children: React.ReactNode;
  tone?: "default" | "accent";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-pill border px-2 py-0.5 text-xs",
        tone === "accent"
          ? "border-transparent bg-accent-tint text-accent-text"
          : "border-line text-muted",
        className,
      )}
    >
      {children}
    </span>
  );
}
