import { z } from "zod";

// Minimal Google OAuth + Calendar REST helpers. Plain fetch, no SDK — the
// surface we use is tiny and a dependency would be pure weight. Every call
// carries a timeout (graceful degradation: Google being slow must never hang
// a Reflow request), and every response is Zod-validated defensively.
//
// Server-only: reads GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET from env.

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_BASE = "https://www.googleapis.com/calendar/v3";

const TOKEN_TIMEOUT_MS = 8_000;
const EVENTS_TIMEOUT_MS = 10_000;
const MAX_EVENT_PAGES = 4; // 4 × 2500 events for an 8-day window is already absurd

// The extended-property key that marks an event as pushed by Reflow. The sync
// pull EXCLUDES events carrying it — otherwise every pushed block would come
// back as a fixed block and the scheduler would deadlock on its own output.
export const REFLOW_TASK_ID_PROP = "reflow_task_id";

export class GoogleApiError extends Error {
  readonly status: number | undefined;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "GoogleApiError";
    this.status = status;
  }
}

function requiredEnv(name: "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET"): string {
  const value = process.env[name];
  if (!value) throw new GoogleApiError(`${name} is not configured`);
  return value;
}

export function googleRedirectUri(): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (!site) throw new GoogleApiError("NEXT_PUBLIC_SITE_URL is not configured");
  return new URL("/api/calendar/callback", site).toString();
}

// --- OAuth -----------------------------------------------------------------

// Consent URL. `openid email` rides along with the calendar scope so the
// token exchange returns an id_token we can read google_email from (shown in
// the day view's "connected as …" affordance).
export function buildConsentUrl(state: string): string {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", requiredEnv("GOOGLE_CLIENT_ID"));
  url.searchParams.set("redirect_uri", googleRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set(
    "scope",
    "openid email https://www.googleapis.com/auth/calendar.events",
  );
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent"); // guarantees a refresh_token on re-connect
  url.searchParams.set("state", state);
  return url.toString();
}

const tokenResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number(),
  refresh_token: z.string().optional(),
  id_token: z.string().optional(),
});

const idTokenPayloadSchema = z.object({ email: z.string().optional() });

// The id_token comes straight from Google over TLS in a server-to-server
// exchange, so decoding without signature verification is safe here.
function emailFromIdToken(idToken: string): string | null {
  try {
    const payload = idToken.split(".")[1];
    if (!payload) return null;
    const json: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const parsed = idTokenPayloadSchema.safeParse(json);
    return parsed.success ? (parsed.data.email ?? null) : null;
  } catch {
    return null;
  }
}

function expiryFrom(expiresInSeconds: number): string {
  return new Date(Date.now() + expiresInSeconds * 1_000).toISOString();
}

async function tokenRequest(params: URLSearchParams): Promise<z.infer<typeof tokenResponseSchema>> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
  });
  if (!res.ok) throw new GoogleApiError(`token endpoint returned ${res.status}`, res.status);
  const parsed = tokenResponseSchema.safeParse(await res.json());
  if (!parsed.success) throw new GoogleApiError("token endpoint returned an unexpected shape");
  return parsed.data;
}

export type ExchangedTokens = {
  accessToken: string;
  refreshToken: string | null;
  tokenExpiry: string; // ISO instant
  email: string | null;
};

export async function exchangeCode(code: string): Promise<ExchangedTokens> {
  const data = await tokenRequest(
    new URLSearchParams({
      code,
      client_id: requiredEnv("GOOGLE_CLIENT_ID"),
      client_secret: requiredEnv("GOOGLE_CLIENT_SECRET"),
      redirect_uri: googleRedirectUri(),
      grant_type: "authorization_code",
    }),
  );
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    tokenExpiry: expiryFrom(data.expires_in),
    email: data.id_token ? emailFromIdToken(data.id_token) : null,
  };
}

export type RefreshedToken = { accessToken: string; tokenExpiry: string };

export async function refreshAccessToken(refreshToken: string): Promise<RefreshedToken> {
  const data = await tokenRequest(
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: requiredEnv("GOOGLE_CLIENT_ID"),
      client_secret: requiredEnv("GOOGLE_CLIENT_SECRET"),
      grant_type: "refresh_token",
    }),
  );
  return { accessToken: data.access_token, tokenExpiry: expiryFrom(data.expires_in) };
}

// --- Calendar events -------------------------------------------------------

const eventTimeSchema = z
  .object({ dateTime: z.string().nullish(), date: z.string().nullish() })
  .nullish();

const eventSchema = z.object({
  id: z.string(),
  status: z.string().nullish(),
  summary: z.string().nullish(),
  transparency: z.string().nullish(),
  start: eventTimeSchema,
  end: eventTimeSchema,
  extendedProperties: z
    .object({ private: z.record(z.string(), z.string()).nullish() })
    .nullish(),
});

const eventsPageSchema = z.object({
  items: z.array(z.unknown()).nullish(),
  nextPageToken: z.string().nullish(),
});

const insertedEventSchema = z.object({ id: z.string() });

export type GoogleEvent = {
  id: string;
  summary: string | null;
  start: string; // ISO dateTime — all-day events are filtered out here
  end: string;
  transparent: boolean;
  reflowTaskId: string | null; // non-null ⇒ this event was pushed by Reflow
};

function authHeaders(accessToken: string): HeadersInit {
  return { authorization: `Bearer ${accessToken}`, "content-type": "application/json" };
}

function eventsUrl(calendarId: string, eventId?: string): string {
  const base = `${GOOGLE_CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events`;
  return eventId ? `${base}/${encodeURIComponent(eventId)}` : base;
}

// Timed events in [timeMin, timeMax], recurrences expanded, cancelled and
// all-day entries dropped. Each item is validated individually so one odd
// event can't sink the whole sync.
export async function listEvents(
  accessToken: string,
  calendarId: string,
  timeMinIso: string,
  timeMaxIso: string,
): Promise<GoogleEvent[]> {
  const out: GoogleEvent[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_EVENT_PAGES; page++) {
    const url = new URL(eventsUrl(calendarId));
    url.searchParams.set("timeMin", timeMinIso);
    url.searchParams.set("timeMax", timeMaxIso);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("maxResults", "2500");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url, {
      headers: authHeaders(accessToken),
      signal: AbortSignal.timeout(EVENTS_TIMEOUT_MS),
    });
    if (!res.ok) throw new GoogleApiError(`events list returned ${res.status}`, res.status);
    const parsedPage = eventsPageSchema.safeParse(await res.json());
    if (!parsedPage.success) throw new GoogleApiError("events list returned an unexpected shape");

    for (const raw of parsedPage.data.items ?? []) {
      const item = eventSchema.safeParse(raw);
      if (!item.success) continue;
      const event = item.data;
      if (event.status === "cancelled") continue;
      const start = event.start?.dateTime;
      const end = event.end?.dateTime;
      if (!start || !end) continue; // all-day — never a busy block
      out.push({
        id: event.id,
        summary: event.summary ?? null,
        start,
        end,
        transparent: event.transparency === "transparent",
        reflowTaskId: event.extendedProperties?.private?.[REFLOW_TASK_ID_PROP] ?? null,
      });
    }

    if (!parsedPage.data.nextPageToken) break;
    pageToken = parsedPage.data.nextPageToken;
  }
  return out;
}

export type EventInput = { summary: string; startIso: string; endIso: string };

// Insert a Reflow-pushed block; returns the new Google event id. The
// extended property is what lets the sync pull recognize (and exclude) it.
export async function insertEvent(
  accessToken: string,
  calendarId: string,
  input: EventInput & { reflowTaskId: string },
): Promise<string> {
  const res = await fetch(eventsUrl(calendarId), {
    method: "POST",
    headers: authHeaders(accessToken),
    signal: AbortSignal.timeout(EVENTS_TIMEOUT_MS),
    body: JSON.stringify({
      summary: input.summary,
      start: { dateTime: input.startIso },
      end: { dateTime: input.endIso },
      extendedProperties: { private: { [REFLOW_TASK_ID_PROP]: input.reflowTaskId } },
    }),
  });
  if (!res.ok) throw new GoogleApiError(`event insert returned ${res.status}`, res.status);
  const parsed = insertedEventSchema.safeParse(await res.json());
  if (!parsed.success) throw new GoogleApiError("event insert returned an unexpected shape");
  return parsed.data.id;
}

// "missing" ⇒ the event no longer exists on Google (deleted there); the
// caller should insert a fresh one instead.
export async function patchEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  input: EventInput,
): Promise<"ok" | "missing"> {
  const res = await fetch(eventsUrl(calendarId, eventId), {
    method: "PATCH",
    headers: authHeaders(accessToken),
    signal: AbortSignal.timeout(EVENTS_TIMEOUT_MS),
    body: JSON.stringify({
      summary: input.summary,
      start: { dateTime: input.startIso },
      end: { dateTime: input.endIso },
    }),
  });
  if (res.status === 404 || res.status === 410) return "missing";
  if (!res.ok) throw new GoogleApiError(`event patch returned ${res.status}`, res.status);
  return "ok";
}

// Already-gone (404/410) counts as success — the goal is absence.
export async function deleteEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<void> {
  const res = await fetch(eventsUrl(calendarId, eventId), {
    method: "DELETE",
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(EVENTS_TIMEOUT_MS),
  });
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new GoogleApiError(`event delete returned ${res.status}`, res.status);
  }
}
