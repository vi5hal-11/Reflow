import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { calendarAvailable } from "@/lib/calendar/status";
import { exchangeCode } from "@/lib/calendar/google";
import { STATE_COOKIE, STATE_COOKIE_PATH } from "../connection";

// Google sends the browser back here after consent. Every outcome is a
// redirect to /today — a raw error page mid-OAuth would be the opposite of
// calm. Failures land on /today?calendar_error=1 and the day view shows a
// gentle "try again whenever" notice.
export async function GET(request: NextRequest) {
  const redirectTo = (failed: boolean) => {
    const url = new URL(failed ? "/today?calendar_error=1" : "/today", request.nextUrl);
    const response = NextResponse.redirect(url, 302);
    // The nonce is single-use either way.
    response.cookies.set(STATE_COOKIE, "", { path: STATE_COOKIE_PATH, maxAge: 0 });
    return response;
  };

  try {
    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");
    const cookieState = request.cookies.get(STATE_COOKIE)?.value;
    if (!code || !state || !cookieState || state !== cookieState) {
      return redirectTo(true);
    }
    if (!calendarAvailable()) return redirectTo(true);

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return redirectTo(true);

    const tokens = await exchangeCode(code);
    // prompt=consent means Google always issues a refresh token; without one
    // the connection would silently die within the hour — refuse it.
    if (!tokens.refreshToken) return redirectTo(true);

    const admin = createAdminClient();
    const { error } = await admin.from("calendar_connections").upsert(
      {
        user_id: user.id,
        google_email: tokens.email,
        refresh_token: tokens.refreshToken,
        access_token: tokens.accessToken,
        token_expiry: tokens.tokenExpiry,
      },
      { onConflict: "user_id" },
    );
    if (error) return redirectTo(true);

    return redirectTo(false);
  } catch {
    return redirectTo(true);
  }
}
