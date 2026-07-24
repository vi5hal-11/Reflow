# Reflow

An adaptive daily planner that heals itself when the day falls apart. Capture in a second, plan around your fixed events and energy, and when you fall behind the plan quietly re-flows — no wall of overdue red, no guilt.

**The architectural bet:** the scheduler is deterministic (fast, testable, free to run); the LLM only touches the edges (natural-language capture parsing and end-of-day reflection). See [CLAUDE.md](CLAUDE.md) for the full product spec and [docs/research](docs/research) for the market/technical research behind it.

## Repository layout

```
apps/web/            Next.js (App Router) + TypeScript + Tailwind — the app + BFF
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

The web app renders a usable page even when the scheduler service is down (graceful degradation is a core principle).

### Database

Migrations live in `supabase/migrations/` and are applied to the Supabase project (`reflow`, region `ap-south-1`). Every table has row-level security scoped to `auth.uid()`.

## Auth

**Email + password** sign-in/up works out of the box (Supabase may send a one-time confirmation email unless you disable Authentication → Providers → Email → "Confirm email"). **"Continue with Google"** is one click once you enable it: Supabase dashboard → Authentication → Providers → **Google** → paste the same `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, and add `https://<project>.supabase.co/auth/v1/callback` as an authorized redirect URI in Google Cloud Console. A one-time **magic link** remains as a fallback link on the sign-in page.

## Build phases

**Done:** Phase 0 (scaffold) · Phase 1 (capture & inbox — omnibox with optimistic capture, background `/parse` enrichment via schema-constrained LLM output (Gemini since Phase 6), keyboard triage: `t` today / `l` later / `x` drop) · Phase 2 (manual day + Daily Big 3 — `/today` timeline around fixed blocks and calendar events, click-to-place tasks into free gaps, star up to three Big 3 with a calm win banner, complete/unplace/later — all optimistic) · Phase 3 (**the milestone that makes it Reflow**: deterministic greedy energy-aware scheduler in the FastAPI service — Big 3 first, deadline/priority/FIFO ranking, stable re-flow that keeps still-valid blocks, wildcard breathing room, overflow-not-failure; ~0.5ms per 50-task re-flow against a <50ms budget; "Plan my day" + silent self-healing re-flow on complete/place/tab-focus in the web app, with graceful 503 degradation to manual placement) · Phase 4 (Google Calendar, bidirectional — pull external events into the plan as immovable blocks with a 5-minute-throttled sync that re-flows only when something out there actually changed; push scheduled Reflow blocks out to Google after each plan via post-response `after()`, tagged with an extended property the pull recognizes and excludes so the scheduler never treats its own output as a constraint; OAuth via a service-role-only token table the browser can never read) · Phase 5 (no-guilt polish + estimate learning — soft roll-forward of unfinished tasks into today with a "no baggage" note and never an overdue badge; a 28-day momentum strip that dims but never resets, with explicit rest days and comeback framing; estimate-vs-actual logging on completion and transparent per-energy-tag padding of future plans; week-old inbox items resurfaced in a gentle "keep, schedule, or drop" section) · Phase 6 (voice capture via the browser's Web Speech API; end-of-day reflection — one kind, specific insight from Gemini with a warm deterministic fallback; one-click JSON + iCal export. LLM edges run on **Google Gemini Flash free tier**; Stripe/monetization deliberately deferred).

**All CLAUDE.md §9 MVP phases (0–6, minus payments) are built.** Remaining founder setup: env keys (see below).

**Google Calendar sync was removed on 2026-07-23** (founder decision — see `DECISIONS.md`). It carried an OAuth round-trip and a service-role token table for a capability the core loop never needed, so the web app now requires **no Google credentials and no Supabase secret key** at runtime. `SUPABASE_SECRET_KEY` is used only by the signed-in Playwright suite to seed a test user.

Since then: **projects** (create/rename/archive/colour, assign from a task, filter the inbox), **optional day tasks** (bonus work that is never scheduled and never rolls forward), **habit editing and deletion**, and a mobile **More** sheet surfacing Projects · Week · Focus · Journal · Progress.

To enable parse enrichment and end-of-day reflection, set `GEMINI_API_KEY` (free at [aistudio.google.com](https://aistudio.google.com), no card; optionally `GEMINI_MODEL`, default `gemini-2.5-flash`) in the scheduler service environment. Without it the app still works — captures simply stay as typed and reflection stays quiet.
