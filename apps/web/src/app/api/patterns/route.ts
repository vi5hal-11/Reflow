import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// Gentle fortnight patterns. The client sends already-aggregated numbers (it
// holds the data); this route authenticates and forwards to the scheduler's
// LLM edge. 503 { degraded } on trouble — the Insights card just stays quiet.
const bodySchema = z.object({
  mood_series: z.array(z.number().int().min(1).max(5).nullable()).max(31),
  habits: z
    .array(
      z.object({
        title: z.string().min(1).max(120),
        kind: z.string().max(20),
        days_active: z.number().int().min(0).max(31),
        window_days: z.number().int().min(1).max(31),
      }),
    )
    .max(50),
  journal_days: z.number().int().min(0).max(31),
  meditation_minutes: z.number().int().min(0).max(100000),
  workout_minutes: z.number().int().min(0).max(100000),
  window_days: z.number().int().min(1).max(31),
});

const resultSchema = z.object({
  observations: z.array(z.string()).max(4),
  reflect_prompt: z.string(),
  source: z.enum(["llm", "fallback"]),
});

const degraded = () => NextResponse.json({ degraded: true }, { status: 503 });

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
  if (!schedulerUrl) return degraded();

  try {
    const res = await fetch(`${schedulerUrl}/patterns`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(25_000),
      body: JSON.stringify(parsed.data),
    });
    if (!res.ok) return degraded();
    return NextResponse.json(resultSchema.parse(await res.json()));
  } catch {
    return degraded();
  }
}
