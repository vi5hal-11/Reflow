import { cn } from "@/lib/utils";

// The one restorative motif (DESIGN §7): a sage sun cresting a horizon, saved
// for the two true peaks only — inbox-zero and the Big-3 win. Pure SVG on the
// accent tokens, so it themes and costs no image bytes.
export function SunHorizon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 140 76"
      className={cn("h-16 w-auto", className)}
      fill="none"
      aria-hidden
    >
      {/* rays */}
      <g stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" opacity="0.55">
        <line x1="70" y1="6" x2="70" y2="16" />
        <line x1="45" y1="14" x2="50" y2="22" />
        <line x1="95" y1="14" x2="90" y2="22" />
        <line x1="30" y1="33" x2="40" y2="35" />
        <line x1="110" y1="33" x2="100" y2="35" />
      </g>
      {/* glow */}
      <path d="M42 52 a28 28 0 0 1 56 0 Z" fill="var(--accent-tint)" />
      {/* sun cresting the horizon */}
      <path d="M50 52 a20 20 0 0 1 40 0 Z" fill="var(--accent)" opacity="0.9" />
      {/* horizon */}
      <line
        x1="12"
        y1="52"
        x2="128"
        y2="52"
        stroke="var(--accent)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
