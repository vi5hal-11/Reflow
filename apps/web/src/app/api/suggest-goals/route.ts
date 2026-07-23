import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// Onboarding: forward the questionnaire to the scheduler's LLM edge, which
// always returns a usable set (its own deterministic fallback). If the
// scheduler itself is unreachable we still answer with a tiny starter set —
// onboarding must never dead-end.
const COLORS = ["sage", "blue", "violet", "teal", "amber", "clay"] as const;
const ICONS = ["sparkles", "brain", "book", "droplet", "sunrise", "footprints", "heart", "dumbbell", "moon"] as const;
const KINDS = ["habit", "meditation", "workout"] as const;

const bodySchema = z.object({
  focus_areas: z.array(z.string().max(40)).max(8).default([]),
  aspiration: z.string().max(500).nullable().default(null),
  constraints: z.string().max(500).nullable().default(null),
  existing_habits: z.array(z.string().max(120)).max(50).default([]),
});

const suggestionSchema = z.object({
  goals: z
    .array(
      z.object({
        title: z.string().min(1).max(120),
        color: z.enum(COLORS).catch("sage"),
        habits: z
          .array(
            z.object({
              title: z.string().min(1).max(120),
              kind: z.enum(KINDS).catch("habit"),
              icon: z.enum(ICONS).catch("sparkles"),
              color: z.enum(COLORS).catch("sage"),
              cadence: z.enum(["daily", "weekly"]).catch("daily"),
            }),
          )
          .max(5),
      }),
    )
    .max(4),
  source: z.enum(["llm", "fallback"]),
});

const LOCAL_FALLBACK = {
  goals: [
    {
      title: "Do the work that matters",
      color: "violet",
      habits: [
        { title: "One deep-work block before noon", kind: "habit", icon: "brain", color: "violet", cadence: "daily" },
        { title: "Read 10 minutes", kind: "habit", icon: "book", color: "teal", cadence: "daily" },
      ],
    },
    {
      title: "Carry less tension",
      color: "teal",
      habits: [
        { title: "Sit for 10 minutes", kind: "meditation", icon: "brain", color: "teal", cadence: "daily" },
        { title: "Wind down screen-free", kind: "habit", icon: "moon", color: "violet", cadence: "daily" },
      ],
    },
  ],
  source: "fallback" as const,
};

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const schedulerUrl = process.env.SCHEDULER_URL;
  if (!schedulerUrl) return NextResponse.json(LOCAL_FALLBACK);

  try {
    const res = await fetch(`${schedulerUrl}/suggest-goals`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(25_000),
      body: JSON.stringify(parsed.data),
    });
    if (!res.ok) return NextResponse.json(LOCAL_FALLBACK);
    return NextResponse.json(suggestionSchema.parse(await res.json()));
  } catch {
    return NextResponse.json(LOCAL_FALLBACK);
  }
}
