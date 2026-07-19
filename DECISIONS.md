# DECISIONS.md

Running log of implementation decisions that deviate from or refine CLAUDE.md. Newest first.

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
