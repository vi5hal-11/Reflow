# CLAUDE.md — Reflow

> **Working name: "Reflow"** (placeholder — swap freely). The name should evoke *graceful recovery*: a plan that re-flows around disruption instead of breaking.

This file is the single source of truth for building Reflow. Read it fully before writing any code. When a decision isn't covered here, prefer the option that is (1) faster at runtime, (2) simpler to ship solo, (3) more forgiving to the user — in that order.

---

## 1. What we're building (and why it wins)

Reflow is an **adaptive daily planner that heals itself when the day falls apart.** You tell it what you need to do; it lays out a realistic day around your fixed events and energy; when you fall behind, it silently re-flows the rest of the plan instead of leaving you staring at a wall of overdue tasks.

It's built on three validated, high-intensity user pains (from prior research):

1. **Setup friction** — people abandon planners before they get value. Reflow's front door is a one-second capture box with zero required fields.
2. **All-or-nothing collapse** — rigid schedules "topple like Jenga" the moment reality intervenes. Reflow re-plans continuously so one slip never kills the day.
3. **Productivity guilt** — tools shame users into churning. Reflow reframes success around a **Daily Big 3** and rolls unfinished work forward gently, with momentum-based (never-resetting) consistency.

### The one architectural bet that matters

**The scheduler is deterministic. The LLM only touches the edges.**

Most competitors are thin GPT wrappers: they ask an LLM to "plan my day," which is slow, expensive, non-deterministic, and bad at real constraint satisfaction. We do the opposite:

- **Deterministic engine** does all scheduling/re-flowing — fast (<50ms), reliable, testable, free to run.
- **LLM (Claude)** is used *only* for: (a) parsing natural-language capture into structured tasks, and (b) end-of-day reflection/insights. Never for placing blocks.

This is our moat. Speed is the #1 thing users rage about; staying deterministic keeps us fast and cheap while the wrapper crowd stays slow. **Do not route core scheduling through the LLM.**

---

## 2. Non-goals (do NOT build these)

Feature creep and bloat are the enemy. For the MVP, explicitly out of scope:

- ❌ Team/collaboration/sharing — single-player only. No multiplayer until PMF.
- ❌ Note-taking / PKM / docs — Reflow is not Notion. Tasks and plans only.
- ❌ Heavy configuration, custom workflows, template galleries — opinionated defaults win.
- ❌ Native desktop (Electron) app — this is what makes competitors slow. Web + PWA only.
- ❌ Gamification beyond gentle momentum — no XP, no punishing streaks, no leaderboards.
- ❌ A chat interface as the primary UX — capture and plan are the product; chat is not.

When tempted to add something, ask: *does this reduce friction, prevent collapse, or reduce guilt?* If not, it waits.

---

## 3. Tech stack

Aligned to the founder's existing stack. Don't introduce new frameworks without reason.

| Layer | Choice | Notes |
|---|---|---|
| Web app | **Next.js (App Router) + React + TypeScript** | PWA-enabled for mobile. Server Components where sensible. |
| Styling | **Tailwind CSS + shadcn/ui** | Clean, fast, minimal. No heavy component libs. |
| Scheduling & AI service | **FastAPI (Python)** | Houses the deterministic scheduler + LLM orchestration. Exposed as an internal API to the Next.js app. |
| Auth + DB + realtime | **Supabase** (Postgres, Auth, Row-Level Security, Realtime) | RLS on every table from day one. |
| LLM | **Google Gemini Flash (free tier)** | Founder call 2026-07-20 (was Anthropic — see DECISIONS.md): zero-cost AI Studio key. Structured JSON output only. Used at the edges (see §1). |
| Calendar | **Google Calendar API** (OAuth) | Bidirectional sync. Phase 4. |
| Payments | **Stripe** | Phase 6 / post-MVP gating. |
| Hosting | Vercel (web) + Fly.io/Railway (FastAPI) + Supabase cloud | Keep infra boring. |

**Architecture shape:** Next.js is the app + BFF (thin API routes for CRUD via Supabase). The FastAPI service owns two responsibilities only: `POST /schedule` (deterministic re-flow) and `POST /parse` + `POST /reflect` (LLM edges). Keep them decoupled — the app must render a usable plan even if the AI service is down (graceful degradation: manual placement still works).

> If keeping two services feels heavy early on, it's acceptable to start the scheduler as a TypeScript module inside Next.js and extract it to FastAPI once it stabilizes. The deterministic logic is portable. Flag this choice in your first commit and stay consistent.

---

## 4. Core domain model (Supabase / Postgres)

Enable RLS on all tables; every row scoped to `user_id = auth.uid()`.

```
users                (managed by Supabase Auth)
profiles             id (fk auth.users), display_name, timezone,
                     working_hours_start, working_hours_end,
                     energy_profile (jsonb: e.g. {"deep":["09:00-12:00"],"admin":["14:00-16:00"]}),
                     default_buffer_minutes, created_at

projects             id, user_id, name, color, archived, created_at

tasks                id, user_id, project_id (nullable),
                     title, notes,
                     status ('inbox' | 'todo' | 'scheduled' | 'done' | 'rolled'),
                     estimated_minutes, actual_minutes (nullable),
                     energy_tag ('deep' | 'shallow' | 'admin'),
                     priority (int 1-3),
                     deadline (nullable, tstz),
                     is_fixed (bool),               -- fixed-time appt vs flexible task
                     fixed_start (nullable),        -- for is_fixed tasks
                     is_big3 (bool),
                     scheduled_start, scheduled_end (nullable),
                     source ('text'|'voice'|'share'|'manual'),
                     created_at, updated_at

daily_plans          id, user_id, plan_date, generated_at,
                     big3_task_ids (jsonb array),
                     status ('active'|'archived')

calendar_events      id, user_id, google_event_id, title,
                     start, end, is_busy, synced_at     -- read-mostly cache of external events

estimate_history     id, user_id, energy_tag, estimated_minutes,
                     actual_minutes, created_at         -- powers estimate-vs-actual learning

momentum             id, user_id, metric_date, active (bool)
                     -- consistency as a rolling heatmap, NOT a breakable streak counter
```

Notes:
- `inbox` is just `status='inbox'` — no separate table. The inbox is the funnel; everything enters here.
- `rolled` status = moved to a future day (gently), distinct from `done`. Never show rolled tasks as "overdue red."
- Store durations in minutes (ints), times in `timestamptz`, and always resolve against `profiles.timezone`.

---

## 5. The scheduler (the heart of the product)

A deterministic, greedy interval-placement algorithm. Spec it as pure functions; unit-test it hard.

### Inputs
- `now` (current datetime)
- `working_window` (today's start/end from profile, clamped to `now` for re-flows)
- `fixed_blocks`: fixed tasks + external `calendar_events` (immovable)
- `flexible_tasks`: tasks with status `todo`/`scheduled` and no fixed time, each with `estimated_minutes`, `energy_tag`, `priority`, optional `deadline`, `is_big3`
- `energy_profile`, `default_buffer_minutes`

### Algorithm (greedy, energy-aware)
1. Compute **free intervals** = working_window minus fixed_blocks minus buffers.
2. **Rank** flexible tasks by a score: `is_big3` first, then deadline urgency (closer = higher), then `priority`, then FIFO. Big 3 always get placed before anything else.
3. For each ranked task, find the **best-fit free interval**: prefer an interval whose time-of-day matches the task's `energy_tag` per `energy_profile` (deep work in peak hours, admin in the fog). Fall back to any interval large enough.
4. Place the task (respecting buffer padding on both sides). Split the interval; continue.
5. Tasks that don't fit anywhere → **overflow list** (not failure). Offer three fates in the UI: later today (if any gap frees up), a reserved **Wildcard block**, or **roll to tomorrow**.
6. Always reserve **1–2 Wildcard/overflow blocks** by default (white space is a feature). Don't pack the day to 100%.

### Self-healing / re-flow trigger
Re-run the algorithm (over *remaining* time and *unfinished* tasks) when:
- the user marks a task done/skipped,
- a task overruns its block (detected on app focus / a lightweight timer),
- the user adds/edits a task,
- a periodic tick while the app is open (e.g., on window focus).

Re-flow must be **stable**: don't reshuffle blocks that are still valid (minimize churn — moving a block the user is mentally committed to is itself friction). Only move what must move. Prefer keeping earlier-in-day placements fixed once the user has "started" the day.

### Estimate-vs-actual learning
On task completion, log `estimate_history`. When estimating future tasks of the same `energy_tag` (or same recurring title), apply a correction factor derived from the user's historical ratio (people chronically under-estimate — expect a factor > 1). Surface padded estimates transparently ("you usually run ~40% over on deep work").

### Keep it fast
Target <50ms for a full re-flow of a typical day (<50 tasks). Pure in-memory computation. No LLM, no network in the hot path.

---

## 6. Capture (the front door)

The first thing a new user touches. Must feel instant.

- **One omnibox**, always reachable (global shortcut on web, share-target + PWA shortcut on mobile). Types: text, voice (transcribe), and OS share-sheet.
- Submitting does **one thing**: drops a raw item into the inbox (`status='inbox'`). Zero required fields. Optimistic UI — the item appears before any network round-trip.
- A **background** `POST /parse` (LLM) enriches the item: is it a task? extract a title, an estimated duration, an energy_tag, a deadline if a date is mentioned, and a suggested project. Results are *suggestions* the user can accept/override during triage. Never block capture on the LLM.
- **Triage flow:** a fast inbox-zero view where the user swipes items into Today / Later / project, one keystroke each.
- **Anti-graveyard:** a weekly resurfacing digest of inbox items dumped and never actioned ("here are 6 things you captured and haven't touched — keep, schedule, or drop?").

### `/parse` output contract (strict JSON)
```json
{
  "is_task": true,
  "title": "Draft Q3 investor update",
  "estimated_minutes": 90,
  "energy_tag": "deep",
  "deadline": "2026-07-25T17:00:00",
  "suggested_project": "Fundraising",
  "confidence": 0.82
}
```
Prompt Claude to return only this object, no prose. Validate/parse defensively; on any failure, fall back to a bare task with just the raw text as title.

---

## 7. The no-guilt system (the emotional layer)

This is positioning, expressed in product mechanics. Enforce it everywhere:

- **Daily Big 3.** The day view foregrounds three chosen outcomes. If those land, the day is a "win" banner — regardless of what else slipped.
- **Soft roll-forward.** Unfinished tasks at day's end move to `rolled` and reappear tomorrow. No overdue-red, no counters of shame, no "you failed" language.
- **Momentum, not streaks.** Consistency is a rolling heatmap / percentage over a window. Missing a day *dims*, never *resets to zero*. Offer explicit guilt-neutral "rest day" and "freeze" states.
- **Comeback framing.** Celebrate returning after a gap ("welcome back — you've shown up 12 of the last 20 days"). Recovery speed is the real success metric.
- **Tone.** Copy is calm and non-nagging. No streak-loss push notifications. No dark patterns.

---

## 8. Design & UX principles (non-negotiable, from user research)

1. **Speed is the product.** Every interaction feels instant. Optimistic UI, no spinners on core actions, no bloat. If a feature makes the app slower, it loses.
2. **Mobile works, not "read-only."** PWA with real capture + plan viewing on phone. Core functions must be fully usable on a small screen.
3. **Generous free tier.** Free tier must deliver the core loop (capture + plan + self-heal) genuinely. Gate on *value* later (calendar sync, unlimited AI parse volume, insights), never by crippling the core.
4. **Data portability from day one.** One-click export (JSON + iCal). Lock-in anxiety pushes users away; portability builds the trust that retains them.
5. **No surprise redesigns.** Once shipped, change UI via opt-in and changelogs.
6. **Opinionated, minimal, calm.** One obvious path. Whitespace. No configuration mazes. Sell *forgiveness*, not power.

For visual design, follow the frontend-design skill's guidance (intentional typography, restrained palette, no templated defaults). Aim for a calm, focused aesthetic — this is a tool people open when overwhelmed.

---

## 9. Build phases (ship each before starting the next)

**Phase 0 — Scaffold.** Monorepo, Next.js app, FastAPI service skeleton, Supabase project, schema + RLS migrations, auth (email + Google OAuth), CI, env management. Deployable "hello world" end to end.

**Phase 1 — Capture & inbox.** Omnibox (text first), optimistic inbox, `/parse` LLM enrichment, triage view. This alone should feel delightful.

**Phase 2 — Manual day + Daily Big 3.** A day/timeline view. Manually place flexible tasks into gaps around fixed blocks. Mark Big 3. Complete/skip tasks.

**Phase 3 — The deterministic auto-scheduler + self-heal.** Implement §5 in full. "Plan my day" button; automatic re-flow on completion/overrun/edit. Wildcard blocks, overflow handling, stable re-flow. **This is the milestone that makes it Reflow.** Heavy unit tests.

**Phase 4 — Google Calendar (bidirectional).** Pull fixed events into the plan; push scheduled blocks out. Handle conflicts and re-flow around external changes.

**Phase 5 — No-guilt polish + estimate learning.** Soft roll-forward, momentum heatmap, rest/freeze states, comeback framing, estimate-vs-actual correction, weekly inbox resurfacing.

**Phase 6 — Voice capture, AI reflection, monetization.** Voice-to-task, end-of-day `/reflect` insights ("you slipped on deep work on 3-meeting days"), Stripe + free/Pro gating, export.

Post-MVP: native mobile, more integrations, recurring tasks polish.

---

## 10. Engineering conventions

- **TypeScript strict mode** on. No `any` without a comment justifying it.
- **Validation at boundaries:** Zod on the Next side, Pydantic on FastAPI. Never trust LLM output — parse and validate every field.
- **The scheduler is pure & tested.** Given identical inputs, identical output. Property-based tests for interval math (no overlaps, buffers respected, Big 3 always placed, fixed blocks never moved). Test the nasty cases: overbooked day, back-to-back meetings, a task larger than any gap, midday re-flow.
- **Graceful degradation:** app is usable if the AI service or calendar is down. Core loop never depends on the network hot path.
- **RLS everywhere.** Assume the DB is public; the policy is the security boundary.
- **Secrets** via env, never committed. LLM/API keys server-side only — never ship them to the client.
- **Commits:** small, conventional-commit style, one concern each. Keep a running `DECISIONS.md` for any deviation from this file.
- **Performance budget:** core interactions <100ms perceived; re-flow <50ms compute; initial load lean (watch bundle size — the anti-bloat rule applies to JS payload too).

---

## 11. How to work (instructions for the build agent)

- Work **phase by phase**, top of §9 down. Get each phase running and demoable before moving on. Don't scaffold everything at once.
- At the start of each phase, restate the goal and the acceptance check, then build.
- **Take the lead on implementation choices** within these constraints; don't stop to ask about things this file already decides. Do surface a genuine fork (a real tradeoff not covered here) briefly, pick a sensible default, and continue — note it in `DECISIONS.md`.
- When you finish a phase, summarize what shipped, how to run/test it, and what the next phase needs.
- Guard the three principles relentlessly: **fast, forgiving, frictionless.** If a request (even from the founder) would violate one, say so and propose an alternative.
- Prefer deleting/simplifying over adding. The best version of this product does less, faster.

---

## 12. Success criteria for the MVP

A new user can, within 60 seconds of signing up: dump three things into the box, hit "plan my day," and get a realistic schedule around their calendar — and when they finish something early or blow past a block, the plan quietly re-flows without a single red overdue badge or guilt-trip. It's fast, it works on their phone, and nothing about it makes them feel behind.

If it does that and feels *calm*, we've built the thing.
