import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function schedulerStatus(): Promise<"up" | "down"> {
  const base = process.env.SCHEDULER_URL;
  if (!base) return "down";
  try {
    const res = await fetch(`${base}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(1500),
    });
    return res.ok ? "up" : "down";
  } catch {
    return "down";
  }
}

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/inbox");
  const scheduler = await schedulerStatus();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center gap-10 px-6 py-16">
      <div className="space-y-5">
        <h1 className="font-display text-5xl leading-[1.05] tracking-tight text-ink">
          Reflow
        </h1>
        <p className="max-w-md text-lg leading-relaxed text-muted">
          A daily planner that quietly heals itself when the day falls apart.
          Capture in a second, plan around your energy, and let the rest
          <span className="text-accent-text"> re-flow</span> — no overdue red,
          no guilt.
        </p>
      </div>

      <div className="flex items-center gap-4 text-sm">
        <Link
          href="/login"
          className="rounded-sm bg-accent px-5 py-2.5 font-medium text-paper transition-colors hover:bg-accent-strong"
        >
          Start the day
        </Link>
        <span className="text-faint">no password · magic link</span>
      </div>

      <dl className="grid max-w-md grid-cols-2 gap-4 border-t border-line pt-6 text-sm text-muted">
        <div className="space-y-0.5">
          <dt className="font-medium text-ink">Database</dt>
          <dd>connected</dd>
        </div>
        <div className="space-y-0.5">
          <dt className="font-medium text-ink">Scheduler</dt>
          <dd>{scheduler === "up" ? "connected" : "optional · not running"}</dd>
        </div>
      </dl>
    </main>
  );
}
