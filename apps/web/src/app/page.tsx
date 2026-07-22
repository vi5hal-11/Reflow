import Link from "next/link";
import { Feather, RefreshCw, Sparkles, Zap } from "lucide-react";
import { SunHorizon } from "@/components/ui/sun-horizon";

export const metadata = {
  title: "Reflow — the day that heals itself",
  description:
    "A calm daily planner. Capture in a second, plan around your energy, and when you fall behind it quietly re-flows — no overdue red, no guilt.",
};

// The Today-timeline preview, built from the real tokens so it looks exactly
// like the product (sage now-line, energy-colored rails, Big-3 star, wildcard).
function DayPreview() {
  return (
    <div className="w-full max-w-sm rounded-lg border border-line bg-surface p-4 shadow-[var(--shadow-soft)]">
      <div className="mb-3 flex items-baseline justify-between">
        <span className="font-display text-lg text-ink">Thursday</span>
        <span className="tabular text-xs text-faint">4 of 6 · room to breathe</span>
      </div>
      <div className="mb-3 h-1.5 overflow-hidden rounded-pill bg-accent-tint">
        <div className="h-full w-2/3 rounded-pill bg-accent" />
      </div>
      <ul className="space-y-1.5 text-xs">
        <li className="flex items-stretch gap-2">
          <span className="w-8 shrink-0 pt-1 tabular text-right text-faint">9</span>
          <div className="flex-1 rounded-md border border-line bg-surface px-2 py-1 text-muted">
            Standup · fixed
          </div>
        </li>
        <li className="flex items-stretch gap-2">
          <span className="w-8 shrink-0 pt-1 tabular text-right text-faint">9:30</span>
          <div className="flex-1 rounded-md border border-line border-l-[3px] border-l-energy-deep bg-surface px-2 py-1 text-ink">
            <span className="text-accent">★ </span>Draft the deck · 90m
          </div>
        </li>
        <li className="flex items-center gap-2">
          <span className="w-8 shrink-0 tabular text-right text-accent">now</span>
          <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />
          <span className="h-px flex-1 bg-accent" />
        </li>
        <li className="flex items-stretch gap-2">
          <span className="w-8 shrink-0 pt-1 tabular text-right text-faint">11</span>
          <div className="flex-1 rounded-md border border-line border-l-[3px] border-l-energy-admin bg-surface px-2 py-1 text-ink">
            Email the accountant · admin
          </div>
        </li>
        <li className="flex items-stretch gap-2">
          <span className="w-8 shrink-0" />
          <div className="flex-1 rounded-md border border-dashed border-accent bg-accent-tint px-2 py-1 text-accent-text">
            wildcard · breathing room
          </div>
        </li>
      </ul>
    </div>
  );
}

const PAINS = [
  {
    Icon: Zap,
    title: "Zero-friction capture",
    body: "One box, no required fields. Dump a thought — by text or voice — and get back to your day. The AI sorts out the estimate, energy, and deadline.",
  },
  {
    Icon: RefreshCw,
    title: "It re-flows when you slip",
    body: "Fall behind and the plan quietly rebuilds around what's left. Blocks you've committed to stay put; only what must move, moves. One slip never topples the day.",
  },
  {
    Icon: Feather,
    title: "No guilt, ever",
    body: "A Daily Big 3, soft roll-forward, and momentum that dims but never resets. Unfinished work rolls gently to tomorrow — no overdue red, no shame.",
  },
];

const STEPS = [
  { n: "1", label: "Capture anything", hint: "text, voice, or share — one second" },
  { n: "2", label: "Plan my day", hint: "a realistic day around your energy" },
  { n: "3", label: "It heals when reality hits", hint: "finish early or slip — it re-flows" },
];

export default function Home() {
  return (
    <div className="flex flex-col">
      {/* Nav */}
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
        <span className="font-display text-xl tracking-tight text-ink">Reflow</span>
        <Link
          href="/login"
          className="text-sm text-muted underline underline-offset-4 transition-colors hover:text-ink"
        >
          Sign in
        </Link>
      </header>

      {/* Hero */}
      <section className="mx-auto grid w-full max-w-5xl items-center gap-10 px-6 pt-8 pb-16 sm:pt-14 lg:grid-cols-2 lg:gap-16">
        <div className="space-y-6">
          <h1 className="font-display text-5xl leading-[1.05] tracking-tight text-ink sm:text-6xl">
            The day that heals itself.
          </h1>
          <p className="max-w-md text-lg leading-relaxed text-muted">
            Reflow is a calm daily planner. Capture in a second, plan around your
            energy, and when you fall behind it quietly
            <span className="text-accent-text"> re-flows</span> — no overdue red,
            no guilt.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <Link
              href="/login"
              className="press rounded-sm border border-accent-strong bg-accent px-5 py-2.5 text-sm font-medium text-paper shadow-[var(--shadow-soft)] transition-colors hover:bg-accent-strong"
            >
              Start the day
            </Link>
            <Link
              href="#how"
              className="text-sm text-muted underline underline-offset-4 transition-colors hover:text-ink"
            >
              See how it works
            </Link>
          </div>
        </div>
        <div className="flex justify-center lg:justify-end">
          <DayPreview />
        </div>
      </section>

      {/* The three pains → solutions */}
      <section className="mx-auto w-full max-w-5xl px-6 py-14">
        <h2 className="font-display text-3xl tracking-tight text-ink">
          Built for the days that fall apart.
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {PAINS.map(({ Icon, title, body }) => (
            <div key={title} className="lift rounded-lg border border-line bg-surface p-5">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-accent-tint text-accent-text">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <h3 className="mt-4 text-base font-medium text-ink">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto w-full max-w-5xl px-6 py-14">
        <h2 className="font-display text-3xl tracking-tight text-ink">How it works</h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="rounded-lg border border-line px-5 py-4">
              <span className="font-display text-2xl text-accent-text">{s.n}</span>
              <p className="mt-1 text-base text-ink">{s.label}</p>
              <p className="mt-0.5 text-sm text-faint">{s.hint}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Why it's different */}
      <section className="mx-auto w-full max-w-5xl px-6 py-14">
        <div className="flex flex-col items-start gap-5 rounded-lg border border-accent-tint bg-accent-tint/40 p-8 sm:flex-row sm:items-center">
          <SunHorizon className="h-14 shrink-0" />
          <div>
            <h2 className="flex items-center gap-2 font-display text-2xl tracking-tight text-ink">
              <Sparkles className="h-5 w-5 text-accent" aria-hidden />
              Not another slow chatbot.
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
              A deterministic scheduler does the planning — fast, private, and
              reliable. AI only touches the edges: parsing what you type and
              reflecting at day&apos;s end. Calm and instant, never a wall of
              overdue tasks and never waiting on a model to think.
            </p>
          </div>
        </div>
      </section>

      {/* Close */}
      <section className="mx-auto w-full max-w-5xl px-6 py-16 text-center">
        <h2 className="font-display text-4xl tracking-tight text-ink">
          Open it when you&apos;re overwhelmed.
        </h2>
        <p className="mx-auto mt-3 max-w-md text-muted">
          It&apos;ll meet you where the day actually is.
        </p>
        <Link
          href="/login"
          className="press mt-6 inline-block rounded-sm border border-accent-strong bg-accent px-5 py-2.5 text-sm font-medium text-paper shadow-[var(--shadow-soft)] transition-colors hover:bg-accent-strong"
        >
          Start the day
        </Link>
      </section>

      <footer className="mx-auto w-full max-w-5xl border-t border-line px-6 py-8 text-center text-xs text-faint">
        Reflow · fast, forgiving, frictionless
      </footer>
    </div>
  );
}
