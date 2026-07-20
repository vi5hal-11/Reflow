import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// One-click data portability (§8.4): everything the user owns as JSON, or
// their schedule as iCal. Lock-in anxiety pushes users away; the door being
// visibly open is what keeps them.

function icalEscape(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function icalStamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const format = request.nextUrl.searchParams.get("format") ?? "json";
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "ical") {
    const { data: tasks } = await supabase
      .from("tasks")
      .select("id, title, status, is_fixed, fixed_start, estimated_minutes, scheduled_start, scheduled_end")
      .or("scheduled_start.not.is.null,fixed_start.not.is.null");

    const events = (tasks ?? []).flatMap((t) => {
      const start = t.is_fixed ? t.fixed_start : t.scheduled_start;
      if (!start) return [];
      const end =
        (!t.is_fixed && t.scheduled_end) ||
        new Date(
          new Date(start as string).getTime() + (t.estimated_minutes ?? 60) * 60_000,
        ).toISOString();
      return [
        "BEGIN:VEVENT",
        `UID:${t.id}@reflow`,
        `DTSTAMP:${icalStamp(start as string)}`,
        `DTSTART:${icalStamp(start as string)}`,
        `DTEND:${icalStamp(end as string)}`,
        `SUMMARY:${icalEscape(t.title as string)}`,
        `STATUS:${t.status === "done" ? "COMPLETED" : "CONFIRMED"}`,
        "END:VEVENT",
      ];
    });

    const ical = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Reflow//EN",
      ...events,
      "END:VCALENDAR",
      "",
    ].join("\r\n");

    return new NextResponse(ical, {
      headers: {
        "content-type": "text/calendar; charset=utf-8",
        "content-disposition": `attachment; filename="reflow-${stamp}.ics"`,
      },
    });
  }

  const [tasks, projects, plans, momentum, estimates] = await Promise.all([
    supabase.from("tasks").select("*").order("created_at"),
    supabase.from("projects").select("*").order("created_at"),
    supabase.from("daily_plans").select("*").order("plan_date"),
    supabase.from("momentum").select("*").order("metric_date"),
    supabase.from("estimate_history").select("*").order("created_at"),
  ]);

  const payload = {
    exported_at: new Date().toISOString(),
    tasks: tasks.data ?? [],
    projects: projects.data ?? [],
    daily_plans: plans.data ?? [],
    momentum: momentum.data ?? [],
    estimate_history: estimates.data ?? [],
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="reflow-${stamp}.json"`,
    },
  });
}
