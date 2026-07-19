import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { inboxTaskColumns, parseSuggestionsSchema } from "@/lib/types";

const bodySchema = z.object({ taskId: z.string().uuid() });

// Background enrichment of a captured task. Capture never waits on this;
// any failure leaves the task exactly as the user typed it.
export async function POST(request: Request) {
  const parsedBody = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: task } = await supabase
    .from("tasks")
    .select(inboxTaskColumns)
    .eq("id", parsedBody.data.taskId)
    .single();
  if (!task) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const schedulerUrl = process.env.SCHEDULER_URL;
  if (!schedulerUrl) {
    return NextResponse.json({ applied: false, reason: "scheduler-unconfigured" });
  }

  const [{ data: profile }, { data: projects }] = await Promise.all([
    supabase.from("profiles").select("timezone").eq("id", user.id).single(),
    supabase.from("projects").select("name").eq("archived", false).limit(50),
  ]);

  let suggestions;
  try {
    const res = await fetch(`${schedulerUrl}/parse`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        text: task.raw_text ?? task.title,
        now: new Date().toISOString(),
        timezone: profile?.timezone ?? "UTC",
        existing_projects: (projects ?? []).map((p) => p.name),
      }),
    });
    if (!res.ok) {
      return NextResponse.json({ applied: false, reason: `scheduler-${res.status}` });
    }
    suggestions = parseSuggestionsSchema.parse(await res.json());
  } catch {
    return NextResponse.json({ applied: false, reason: "scheduler-unreachable" });
  }

  // Suggestions pre-fill only what the user hasn't set, and only while the
  // item is still untriaged — never fight an edit the user already made.
  const update: Record<string, unknown> = {
    parse_suggestions: suggestions,
    parsed_at: new Date().toISOString(),
  };
  if (task.status === "inbox" && suggestions.source === "llm" && suggestions.is_task) {
    if (suggestions.confidence >= 0.5 && task.title === (task.raw_text ?? task.title)) {
      update.title = suggestions.title;
    }
    if (task.estimated_minutes === null) update.estimated_minutes = suggestions.estimated_minutes;
    if (task.energy_tag === null) update.energy_tag = suggestions.energy_tag;
    if (task.deadline === null) update.deadline = suggestions.deadline;
  }

  const { data: updated, error } = await supabase
    .from("tasks")
    .update(update)
    .eq("id", task.id)
    .select(inboxTaskColumns)
    .single();
  if (error) {
    return NextResponse.json({ applied: false, reason: "update-failed" });
  }
  return NextResponse.json({ applied: true, task: updated });
}
