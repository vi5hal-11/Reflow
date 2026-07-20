import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { calendarAvailable } from "@/lib/calendar/status";
import { disconnectCalendar } from "../connection";

// The day view's disconnect action (fetch POST — no CSRF surface beyond the
// session cookie, and the operation is idempotent). Same routine as
// DELETE /api/calendar/connect.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!calendarAvailable()) {
    return NextResponse.json({ ok: true });
  }
  try {
    await disconnectCalendar(createAdminClient(), user.id);
  } catch {
    return NextResponse.json({ error: "disconnect failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
