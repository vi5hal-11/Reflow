import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { energyTags } from "@/lib/types";

// End-of-day reflection proxy. The client summarizes its own day (it already
// holds the data) and this route authenticates, bounds the payload, and
// forwards to the scheduler service's LLM edge. 503 { degraded } on any
// trouble — reflection never errors at the user.
const bodySchema = z.object({
  date: z.iso.date(),
  meetings: z.number().int().min(0).max(50),
  showed_up_days: z.number().int().min(0).max(31).nullable(),
  window_days: z.number().int().min(1).max(31).nullable(),
  tasks: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        status: z.enum(["done", "scheduled", "todo", "rolled"]),
        energy_tag: z.enum(energyTags).nullable(),
        estimated_minutes: z.number().int().min(1).max(480).nullable(),
        actual_minutes: z.number().int().min(1).max(480).nullable(),
        was_big3: z.boolean(),
      }),
    )
    .max(100),
});

const reflectionSchema = z.object({
  insight: z.string(),
  pattern: z.string().nullable(),
  encouragement: z.string(),
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
    const res = await fetch(`${schedulerUrl}/reflect`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(25_000),
      body: JSON.stringify(parsed.data),
    });
    if (!res.ok) return degraded();
    const reflection = reflectionSchema.parse(await res.json());
    return NextResponse.json(reflection);
  } catch {
    return degraded();
  }
}
