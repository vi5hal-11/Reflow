# Reflow

An adaptive daily planner that heals itself when the day falls apart. Capture in a second, plan around your fixed events and energy, and when you fall behind the plan quietly re-flows — no wall of overdue red, no guilt.

**The architectural bet:** the scheduler is deterministic (fast, testable, free to run); the LLM only touches the edges (natural-language capture parsing, end-of-day reflection, and gentle pattern insights). See [CLAUDE.md](CLAUDE.md) for the full product spec, [DECISIONS.md](DECISIONS.md) for the running log of implementation decisions, and [docs/research](docs/research) for the market/technical research behind it.

## Repository layout

```
apps/web/            Next.js (App Router) + TypeScript + Tailwind — the app + BFF
apps/web/e2e/        Playwright: public smoke + signed-in core-loop suites
services/scheduler/  FastAPI — deterministic scheduler + LLM edge endpoints
supabase/migrations/ Postgres schema + RLS (applied to the Supabase project)
docs/                Research and design documents
```

## Getting started

### Web app

```bash
cd apps/web
cp .env.example .env.local   # fill in Supabase URL + publishable key
npm install
npm run dev                  # http://localhost:3000
```

### Scheduler service

```bash
cd services/scheduler
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
```

The web app renders a usable page even when the scheduler is down — graceful degradation is a core principle, not a fallback. With the scheduler unreachable, "Plan my day" shows a calm notice and manual placement keeps working; without a Gemini key, captures simply stay as typed.

### Database

Migrations live in `supabase/migrations/` and are applied to the Supabase project (`reflow`, region `ap-south-1`). Every table has row-level security scoped to `auth.uid()` — assume the database is public; the policy is the security boundary.

## Environment variables

**Web** (`apps/web/.env.local`):

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL (client-safe) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | `sb_publishable_…` (client-safe) |
| `NEXT_PUBLIC_SITE_URL` | in prod | Public URL, used for auth redirects |
| `SCHEDULER_URL` | for AI + planning | FastAPI service URL (server-side only) |
| `SUPABASE_SECRET_KEY` | tests only | `sb_secret_…`; used **only** by the signed-in Playwright suite to seed a test user. The app itself never needs it. |

**Scheduler** (`services/scheduler/.env`):

| Variable | Required | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | optional | Enables `/parse`, `/reflect`, `/suggest-goals`, `/patterns`. Free at [aistudio.google.com](https://aistudio.google.com), no card. Unset → those endpoints return 503 and the app degrades gracefully. |
| `GEMINI_MODEL` | optional | Defaults to `gemini-2.5-flash` |

Only the two `NEXT_PUBLIC_*` values ever reach the browser. Never prefix a secret with `NEXT_PUBLIC_`.

## Auth

**Email + password** works out of the box (Supabase sends a one-time confirmation email unless you disable Authentication → Providers → Email → "Confirm email"). **"Continue with Google"** needs the provider enabled in the Supabase dashboard (Authentication → Providers → Google) with a Google Cloud OAuth client whose authorized redirect URI includes `https://<project-ref>.supabase.co/auth/v1/callback` — the app itself needs no Google credentials. A one-time **magic link** remains as a fallback on the sign-in page.

For production, add your deployed origin to Supabase → Authentication → **URL Configuration** (Site URL + Redirect URLs, including `/auth/callback`). Skipping this is the usual cause of "signed in but bounced back to the home page".

## What's built

**Capture & inbox** — a one-second omnibox (text or voice) with optimistic capture; background LLM enrichment suggests an estimate, energy tag, deadline and project; keyboard triage (`t` today / `l` later / `x` drop), multi-select with bulk actions and undo, project filter chips, and a weekly resurfacing of items that have sat untouched. The edit sheet covers title, estimate, energy, project, deadline, repeat, reminder and a subtask checklist.

**The day** — `/today` lays out a timeline around fixed blocks with a now-line, click-to-place and drag-to-reschedule, a **Daily Big 3** with a calm win banner, reserved wildcard breathing room, and overflow treated as an outcome rather than a failure. A day-at-a-glance ring and workload meter sit above it, plus **optional day tasks**: bonus work that is never scheduled, never counted in the day's load, and never rolled forward.

**The scheduler** — a deterministic, greedy, energy-aware placement engine in FastAPI (Big 3 first, then deadline urgency, priority and FIFO), with **stable re-flow** that keeps still-valid blocks where they are and moves only what must move. ~0.5 ms for a 50-task day against a <50 ms budget. Re-flows silently on completion, placement and tab focus.

**No guilt, by construction** — soft roll-forward with a "no baggage" note and never an overdue badge; a 28-day momentum strip that dims but never resets; explicit rest days; comeback framing after a gap; estimate-vs-actual learning that transparently pads future plans; morning and evening rituals, and a reflection you can reach at any hour.

**Projects** — create, rename, archive, restore, delete and colour; assign from a task's edit sheet; filter the inbox by project; one-tap "create + assign" from the AI's suggestion. Deleting a project never deletes its tasks.

**Habits & wellness** — habits with a no-guilt 14-day grid (it dims, it never resets), full editing and deletion, a weather-metaphor mood check-in, daily journaling, a meditation timer, workout minute logging, a deterministic `/progress` page, AI-assisted goal onboarding, and gentle pattern insights. Deliberately single-player: no social, competition, XP or leaderboards.

**Platform** — installable PWA (manifest, icons, OS share-target), a mobile tab bar with a **More** sheet (Projects · Week · Focus · Journal · Progress), instant navigation skeletons, a ⌘K command palette, Today/Week/Focus views, and one-click JSON + iCal export.

## Testing

```bash
cd apps/web
npx playwright install chromium   # first time only
npm run test:e2e                  # public smoke; signed-in specs need SUPABASE_SECRET_KEY
npx tsc --noEmit && npm run lint && npm run build

cd ../../services/scheduler && pytest   # engine unit + property tests
```

The Playwright suite runs on both a desktop and a mobile viewport. Signed-in specs seed a confirmed test user via the Supabase service key and **skip themselves** when it's absent, so CI runs the public smoke suite only. See [apps/web/WALKTHROUGH.md](apps/web/WALKTHROUGH.md) for the human pass.

## Deployment

See [DEPLOY.md](DEPLOY.md) — web on Vercel (root directory `apps/web`), scheduler on Railway or Fly (root `services/scheduler`, Dockerfile included), database on Supabase.

## Not built, on purpose

- **Google Calendar sync** — shipped in Phase 4, then **removed on 2026-07-24**. It carried an OAuth round-trip and a service-role token table for a capability the core loop never needed; removing it also freed the web app from needing any secret key or Google credentials at runtime.
- **Payments / Stripe** — deliberately deferred until there's evidence anyone wants to pay.
- **Team, collaboration, note-taking, chat-as-primary-UX** — permanent non-goals (CLAUDE.md §2). Reflow is single-player, and it plans; it is not Notion and not a chatbot.
