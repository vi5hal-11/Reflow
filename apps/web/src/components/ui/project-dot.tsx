import { cn } from "@/lib/utils";
import { projectColor } from "@/lib/projects";

// A small colored dot for a project. Inline style (not a Tailwind class) so any
// stored hex works without dynamic-class gymnastics.
export function ProjectDot({
  color,
  className,
}: {
  color: string | null | undefined;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("inline-block h-2 w-2 shrink-0 rounded-full", className)}
      style={{ backgroundColor: projectColor(color) }}
    />
  );
}
