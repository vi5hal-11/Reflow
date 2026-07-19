# DECISIONS.md

Running log of implementation decisions that deviate from or refine CLAUDE.md. Newest first.

## 2026-07-19 — Phase 2 (manual day + Daily Big 3)

- **No new migration**: every Phase 2 column (`scheduled_start/end`, `is_big3`, `daily_plans`) already existed in 0001; `planned_date` came in 0003.
- **Skip semantics (pre-Phase-5)**: a placed block can be **unplaced** (back to today's tray) and a tray task moved to **later** (clears `planned_date` and Big 3 membership). No `rolled` status or roll-forward yet — that's Phase 5's soft roll; nothing today shows as overdue.
- **Big 3 persisted in two places** by design: `tasks.is_big3` (per-task flag the Phase 3 scheduler ranks on) and `daily_plans.big3_task_ids` (the day's ordered record), upserted on `(user_id, plan_date)`. The client keeps them in sync on every toggle/later action.
- **Day math is browser-local** (consistent with Phase 1's `localToday()` triage writes). The server page only bounds its fetch with a ±36h window and the client trims to its exact local day. **Self-healing timezone**: `/today` silently updates `profiles.timezone` to the browser's IANA zone when they differ, so server rendering and the Phase 3 scheduler converge on the right zone.
- **Manual placement rules**: duration = `estimated_minutes` (default 30m; fixed tasks default 60m); placement lands at the gap start clamped to *now*, rounded up to 5 minutes; gaps under 10 minutes aren't offered. Buffers are *not* enforced on manual placement — they're the auto-scheduler's job (§5), and overriding a human's explicit choice would be friction.
- **`middleware.ts` → `proxy.ts`**: Next 16 deprecated the middleware file convention; renamed per the bundled docs (same behavior, named `proxy` export).
- **Local dev env**: created `apps/web/.env.local` on the founder's machine (publishable Supabase values only — client-safe by design; RLS is the boundary). Not committed (gitignored).
- **Verification**: tsc + ESLint clean (new `react-hooks/purity` rule respected), production build green, route guard smoke-tested (`/today` → 307 `/login` signed out), and the day view's PostgREST `or=` filter validated against the live API (parses, RLS returns zero rows to anon). Signed-in browser pass still pending a real magic-link session — same limitation logged in Phase 1.

## 2026-07-19 — Phase 1 (capture & inbox)

- **Schema additions (migration 0003)**: `tasks.raw_text` (the capture exactly as typed — never lost), `tasks.parse_suggestions` (full §6 contract stored as jsonb so triage can show/override), `tasks.parsed_at`, and `tasks.planned_date` (what "Today/Later" triage sets; Phase 2's day view reads it). `planned_date` is intentionally distinct from `deadline`.
- **Suggestions auto-apply policy**: `/parse` results pre-fill only fields the user hasn't set, only while the task is still `status='inbox'`, and the title is replaced only at confidence ≥ 0.5. The pre-filled fields *are* the accept/override UX — editing in triage overrides them, and enrichment never overwrites a user edit.
- **`/parse` model**: `claude-opus-4-8` by default (platform-recommended default), overridable via `PARSE_MODEL` env on the scheduler service. Given parse runs on every capture and is a simple extraction task, switching to `claude-haiku-4-5` is a reasonable founder call for cost/latency — one env var, no code change.
- **Structured outputs**: `/parse` uses `client.messages.parse()` with a Pydantic schema (sampling-time guarantee) + defensive validation (past deadlines dropped; Zod re-validation in the web BFF).
- **Graceful degradation verified**: scheduler without `ANTHROPIC_API_KEY` → 503 → web route leaves the task exactly as typed; capture is optimistic and never waits on the LLM.
- **E2E limitation**: the build sandbox's egress policy blocks `*.supabase.co`, so browser-level auth E2E couldn't run here. Verified instead: RLS positive/negative tests executed against the live DB (cross-user insert denied, anon reads zero rows), unauthenticated redirect flow in a real browser, and the full parse contract via unit tests. First deploy should re-run a signed-in capture→triage pass.

## 2026-07-19 — Phase 0

- **Scheduler ships as FastAPI from day one** (not the optional TS-module-first shortcut in §3). The pure interval math (`services/scheduler/app/engine/`) starts tested from Phase 0 so Phase 3 builds on solid ground.
- **Supabase project**: `reflow` (`qakfernzpemibujwxrts`) in `ap-south-1` (Mumbai), free tier. Region chosen as a sensible default for the founder's likely location — cheap to recreate elsewhere before launch if wrong.
- **shadcn/ui deferred to Phase 1**: `ui.shadcn.com` is unreachable from the build environment's egress proxy, so `shadcn init` could not run. The foundation is in place (`components.json`, `cn()` util, clsx/tailwind-merge/CVA/lucide installed); run `npx shadcn add <component>` when building real UI.
- **Auth**: email magic-link wired end to end. Google OAuth needs the founder's Google Cloud OAuth credentials in the Supabase dashboard (Authentication → Providers → Google) — not something the build agent can create. The login page and `/auth/callback` route already handle the OAuth code exchange, so enabling the provider is config-only.
- **Modern publishable key** (`sb_publishable_…`) used instead of the legacy JWT anon key, per current Supabase guidance (independent rotation).
- **`/parse` will use Anthropic structured outputs** (`output_config.format` with a JSON Schema) rather than prompt-only JSON — sampling-time guarantee, stronger than the spec assumed (see research report §2.5). Pydantic validation stays as defense in depth.
- **Trigger functions locked down** (migration 0002): Supabase advisors flagged `SECURITY DEFINER` trigger functions as RPC-callable; `EXECUTE` revoked from `public`/`anon`/`authenticated`.
- **Repo name/visibility**: `vi5hal-11/Reflow`, private, created manually by the founder (the Claude GitHub app cannot create repositories).
