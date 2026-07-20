import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { calendarAvailable } from "@/lib/calendar/status";
import { buildConsentUrl } from "@/lib/calendar/google";
import {
  STATE_COOKIE,
  STATE_COOKIE_MAX_AGE_SECONDS,
  STATE_COOKIE_PATH,
  disconnectCalendar,
} from "../connection";

// Start the Google OAuth round-trip: stash a CSRF nonce in an httpOnly
// cookie and send the browser to Google's consent screen. Reached by a
// plain <a href> from the day view.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!calendarAvailable()) {
    return NextResponse.json({ error: "calendar sync is not configured" }, { status: 409 });
  }

  let consentUrl: string;
  const state = crypto.randomUUID();
  try {
    consentUrl = buildConsentUrl(state);
  } catch {
    return NextResponse.json({ error: "calendar sync is not configured" }, { status: 409 });
  }

  const response = NextResponse.redirect(consentUrl, 302);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: STATE_COOKIE_PATH,
    maxAge: STATE_COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}

// Disconnect. (The day view calls POST /api/calendar/disconnect — same
// routine; this verb-on-the-resource form exists for API symmetry.)
export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!calendarAvailable()) {
    // Nothing reachable to disconnect — report success; the UI shows the
    // connect affordance only when the feature is available anyway.
    return NextResponse.json({ ok: true });
  }
  try {
    await disconnectCalendar(createAdminClient(), user.id);
  } catch {
    return NextResponse.json({ error: "disconnect failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
