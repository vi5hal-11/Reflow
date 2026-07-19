# DECISIONS.md

Running log of implementation decisions that deviate from or refine CLAUDE.md. Newest first.

## 2026-07-19 — Phase 0

- **Scheduler ships as FastAPI from day one** (not the optional TS-module-first shortcut in §3). The pure interval math (`services/scheduler/app/engine/`) starts tested from Phase 0 so Phase 3 builds on solid ground.
- **Supabase project**: `reflow` (`qakfernzpemibujwxrts`) in `ap-south-1` (Mumbai), free tier. Region chosen as a sensible default for the founder's likely location — cheap to recreate elsewhere before launch if wrong.
- **shadcn/ui deferred to Phase 1**: `ui.shadcn.com` is unreachable from the build environment's egress proxy, so `shadcn init` could not run. The foundation is in place (`components.json`, `cn()` util, clsx/tailwind-merge/CVA/lucide installed); run `npx shadcn add <component>` when building real UI.
- **Auth**: email magic-link wired end to end. Google OAuth needs the founder's Google Cloud OAuth credentials in the Supabase dashboard (Authentication → Providers → Google) — not something the build agent can create. The login page and `/auth/callback` route already handle the OAuth code exchange, so enabling the provider is config-only.
- **Modern publishable key** (`sb_publishable_…`) used instead of the legacy JWT anon key, per current Supabase guidance (independent rotation).
- **`/parse` will use Anthropic structured outputs** (`output_config.format` with a JSON Schema) rather than prompt-only JSON — sampling-time guarantee, stronger than the spec assumed (see research report §2.5). Pydantic validation stays as defense in depth.
- **Trigger functions locked down** (migration 0002): Supabase advisors flagged `SECURITY DEFINER` trigger functions as RPC-callable; `EXECUTE` revoked from `public`/`anon`/`authenticated`.
- **Repo name/visibility**: `vi5hal-11/Reflow`, private, created manually by the founder (the Claude GitHub app cannot create repositories).
