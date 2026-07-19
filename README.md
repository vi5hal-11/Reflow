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

Phase 0 (this scaffold) → capture & inbox → manual day + Big 3 → deterministic auto-scheduler + self-heal → Google Calendar sync → no-guilt polish → voice, reflection, monetization. Full roadmap in [CLAUDE.md §9](CLAUDE.md).
