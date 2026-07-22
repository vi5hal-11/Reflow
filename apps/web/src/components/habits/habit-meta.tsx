import {
  Book,
  Brain,
  Droplet,
  Dumbbell,
  Footprints,
  Heart,
  Moon,
  Sparkles,
  Sunrise,
  type LucideIcon,
} from "lucide-react";

// Habit palette + icons in one place. Colour keys are dynamic (per habit), so
// the utility classes are literal here + statically defined in globals.css.
export const HABIT_COLORS = ["sage", "blue", "violet", "teal", "amber", "clay"] as const;
export type HabitColor = (typeof HABIT_COLORS)[number];

export const COLOR: Record<HabitColor, { text: string; bg: string }> = {
  sage: { text: "hc-sage", bg: "hbg-sage" },
  blue: { text: "hc-blue", bg: "hbg-blue" },
  violet: { text: "hc-violet", bg: "hbg-violet" },
  teal: { text: "hc-teal", bg: "hbg-teal" },
  amber: { text: "hc-amber", bg: "hbg-amber" },
  clay: { text: "hc-clay", bg: "hbg-clay" },
};

export function colorOf(c: string | null): HabitColor {
  return (HABIT_COLORS as readonly string[]).includes(c ?? "")
    ? (c as HabitColor)
    : "sage";
}

const ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  brain: Brain,
  book: Book,
  droplet: Droplet,
  sunrise: Sunrise,
  footprints: Footprints,
  heart: Heart,
  dumbbell: Dumbbell,
  moon: Moon,
};
export const HABIT_ICON_KEYS = Object.keys(ICONS);

export function habitIcon(key: string | null): LucideIcon {
  return ICONS[key ?? "sparkles"] ?? Sparkles;
}
