import { forwardRef } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "quiet" | "ghost";
type Size = "sm" | "md";

// The three button intents in Reflow. `primary` carries the accent (a real
// action — Plan my day, Sign in); `quiet` is a bordered secondary; `ghost` is
// a low-emphasis text action. Comfortable touch targets by default (≥44px on md).
const base =
  "press inline-flex items-center justify-center gap-1.5 rounded-sm font-medium transition-colors disabled:cursor-default disabled:opacity-60 disabled:active:scale-100";

const variants: Record<Variant, string> = {
  primary:
    "border border-accent-strong bg-accent text-paper shadow-[var(--shadow-soft)] hover:bg-accent-strong",
  quiet: "border border-line-strong text-ink hover:border-accent hover:bg-accent-tint/40",
  ghost: "text-muted hover:text-ink",
};

const sizes: Record<Size, string> = {
  sm: "px-2.5 py-1.5 text-xs",
  md: "min-h-11 px-4 py-2.5 text-sm sm:min-h-0",
};

export const Button = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: Variant;
    size?: Size;
  }
>(function Button({ variant = "primary", size = "md", className, ...props }, ref) {
  return (
    <button
      ref={ref}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    />
  );
});
