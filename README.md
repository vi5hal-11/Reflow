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

Email magic-link sign-in works out of the box. Google OAuth requires adding OAuth credentials in the Supabase dashboard (Authentication → Providers → Google) — see DECISIONS.md.

## Build phases

**Done:** Phase 0 (scaffold) · Phase 1 (capture & inbox — omnibox with optimistic capture, background `/parse` enrichment via Anthropic structured outputs, keyboard triage: `t` today / `l` later / `x` drop) · Phase 2 (manual day + Daily Big 3 — `/today` timeline around fixed blocks and calendar events, click-to-place tasks into free gaps, star up to three Big 3 with a calm win banner, complete/unplace/later — all optimistic) · Phase 3 (**the milestone that makes it Reflow**: deterministic greedy energy-aware scheduler in the FastAPI service — Big 3 first, deadline/priority/FIFO ranking, stable re-flow that keeps still-valid blocks, wildcard breathing room, overflow-not-failure; ~0.5ms per 50-task re-flow against a <50ms budget; "Plan my day" + silent self-healing re-flow on complete/place/tab-focus in the web app, with graceful 503 degradation to manual placement).

**Next:** Google Calendar sync → no-guilt polish + estimate learning → voice, reflection, monetization. Full roadmap in [CLAUDE.md §9](CLAUDE.md).

To enable live parse enrichment, set `ANTHROPIC_API_KEY` (and optionally `PARSE_MODEL`) in the scheduler service environment. Without it the app still works — captures simply stay as typed.
