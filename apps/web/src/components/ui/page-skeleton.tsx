// Shown instantly on navigation (via each route's loading.tsx) so a tap gives
// immediate feedback while the server component renders — perceived speed is
// the product (CLAUDE.md §8). Calm, low-contrast, motion-safe pulse only.
export function PageSkeleton() {
  return (
    <div
      className="mx-auto w-full max-w-3xl px-6 py-12 pb-28 sm:pb-12"
      aria-hidden
    >
      <div className="space-y-6 motion-safe:animate-pulse">
        <div className="space-y-2">
          <div className="h-3 w-16 rounded bg-line" />
          <div className="h-8 w-48 rounded-md bg-line" />
        </div>
        <div className="h-12 w-full rounded-lg border border-line bg-surface" />
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-14 w-full rounded-lg border border-line bg-surface"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
