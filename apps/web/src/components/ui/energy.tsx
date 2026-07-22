import { Brain, ClipboardList, Waves, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EnergyTag } from "@/lib/types";

// The controlled-blend categorical palette in one place: each energy tag gets a
// muted color + an icon, so the day is scannable by color and shape (not just
// the one sage accent). Sage stays the system accent; these are categorization.
export const ENERGY: Record<
  EnergyTag,
  { label: string; Icon: LucideIcon; text: string; dot: string; borderL: string }
> = {
  deep: {
    label: "Deep",
    Icon: Brain,
    text: "text-energy-deep",
    dot: "bg-energy-deep",
    borderL: "border-l-energy-deep",
  },
  shallow: {
    label: "Shallow",
    Icon: Waves,
    text: "text-energy-shallow",
    dot: "bg-energy-shallow",
    borderL: "border-l-energy-shallow",
  },
  admin: {
    label: "Admin",
    Icon: ClipboardList,
    text: "text-energy-admin",
    dot: "bg-energy-admin",
    borderL: "border-l-energy-admin",
  },
};

export function EnergyChip({ tag, className }: { tag: EnergyTag; className?: string }) {
  const e = ENERGY[tag];
  const Icon = e.Icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-pill border border-line px-2 py-0.5 text-xs",
        e.text,
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {e.label}
    </span>
  );
}

export function EnergyDot({ tag, className }: { tag: EnergyTag; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block h-2 w-2 rounded-full", ENERGY[tag].dot, className)}
    />
  );
}
