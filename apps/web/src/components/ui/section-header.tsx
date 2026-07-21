import { cn } from "@/lib/utils";

// A quiet section label with an optional right-aligned aside (counts, hints).
export function SectionHeader({
  children,
  aside,
  className,
}: {
  children: React.ReactNode;
  aside?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between", className)}>
      <h2 className="text-sm font-medium text-muted">{children}</h2>
      {aside ? <span className="text-xs text-faint">{aside}</span> : null}
    </div>
  );
}
