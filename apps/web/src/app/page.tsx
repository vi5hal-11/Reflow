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
      <div className="space-y-4">
        <h1 className="text-4xl font-medium tracking-tight">Reflow</h1>
        <p className="max-w-md text-neutral-500">
          A daily planner that heals itself when the day falls apart. Capture
          in a second, plan around your energy, and let the rest re-flow.
        </p>
      </div>

      <div className="flex items-center gap-3 text-sm">
        <Link
          href="/login"
          className="rounded-md bg-neutral-900 px-4 py-2 font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
        >
          Sign in
        </Link>
      </div>

      <dl className="grid max-w-md grid-cols-2 gap-4 text-sm text-neutral-500">
        <div>
          <dt className="font-medium text-neutral-900 dark:text-neutral-100">
            Database
          </dt>
          <dd>connected</dd>
        </div>
        <div>
          <dt className="font-medium text-neutral-900 dark:text-neutral-100">
            Scheduler service
          </dt>
          <dd>{scheduler === "up" ? "connected" : "not running (optional)"}</dd>
        </div>
      </dl>

      <p className="text-xs text-neutral-400">
        Phase 0 scaffold · the plan view arrives in Phase 2
      </p>
    </main>
  );
}
