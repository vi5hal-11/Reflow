// A small, calm palette for project swatches — muted tones that sit inside the
// "Warm Paper, One Flow" identity without competing with the sage accent. The
// hex is stored on projects.color and rendered as an inline-styled dot, so no
// dynamic Tailwind classes are needed.
export const PROJECT_COLORS = [
  { name: "Sage", hex: "#6E9A78" },
  { name: "Clay", hex: "#B4785B" },
  { name: "Ochre", hex: "#C79A4B" },
  { name: "Dusk", hex: "#7C7BA8" },
  { name: "Slate", hex: "#5E7C8B" },
  { name: "Rose", hex: "#B4708A" },
  { name: "Moss", hex: "#7E8B54" },
  { name: "Stone", hex: "#8A857C" },
] as const;

export const DEFAULT_PROJECT_COLOR = PROJECT_COLORS[0].hex;

/** A safe fill for a swatch — the stored color, or the default if unset/blank. */
export function projectColor(color: string | null | undefined): string {
  return color && color.trim() ? color : DEFAULT_PROJECT_COLOR;
}
