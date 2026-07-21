# Reflow — Completion & Design Blueprint

> From "MVP code-complete" to "clean, elegant, mobile-first product a stranger can love in 60 seconds."
> Phases 0–6 (CLAUDE.md §9) are built. This plan covers **everything left**: the functional gaps, a
> distinctive-but-calm visual identity, true mobile/PWA support, human + automated verification, and
> deployment. Chosen direction: **Elevate** (bespoke identity). Chosen execution: **Hybrid**
> (workflows where streams are independent, inline where UI interlocks).

**Status legend:** ⬜ not started · 🟨 in progress · ✅ done
**Execution tags:** `[inline]` = I build sequentially · `[workflow]` = parallel agents + adversarial verify · `[you]` = needs the founder

---

## 0. Guardrails that hold for every phase

These are invariants. Every step must leave them true (verified before commit):

1. **The three principles win ties:** fast, forgiving, frictionless. If a design flourish costs perceived speed, it loses.
2. **Graceful degradation intact:** app is fully usable with the scheduler down, the LLM unconfigured, and the calendar unlinked. Never regress this.
3. **No guilt, ever:** no overdue-red, no streak-shame, no nagging copy — in any new surface.
4. **Green gates:** `npx tsc --noEmit`, `npm run lint`, `npm run build` (from `apps/web`) and `pytest` (scheduler) all pass before every commit. The repo's `react-hooks/purity` and `set-state-in-effect` rules are strict — no `Date.now()` in render; defer effect setState via `setTimeout(…,0)` (established pattern).
5. **Secrets server-side only:** never a `NEXT_PUBLIC_` LLM/OAuth/secret var; RLS is the security boundary.
6. **One concern per commit**, conventional-commit style, `Co-Authored-By: Claude Fable 5`. Update `DECISIONS.md` on any deviation; update `README.md` phase status when a phase lands. Push to `main` (direct — no `gh` CLI on this machine).
7. **Mobile is not an afterthought:** every UI phase ships its mobile layout in the same PR, verified at 375px width and with touch targets ≥ 44px.

**Skills to load per phase** are named inline. Design phases: `frontend-design-direction`, `design-system`, `taste`, `make-interfaces-feel-better`, `motion-ui`. Quality: `accessibility`, `react-performance`, `browser-qa`, `e2e-testing`. Ship: `deployment-patterns`, `canary-watch`, `security-review`.

---

## Phase 7 — Design foundation (the identity) `[inline]`

**Goal:** replace the bare default styling with a real, coherent design system — the visual language every later
phase reuses. Nothing user-facing "moves" yet; this is the token + primitive layer.

**Why first:** every other UI phase (settings, editing, mobile nav, polish) should be built *in* the new system,
not retrofitted. Doing this first prevents rework. This is the highest-leverage single phase.

**Load skills:** `frontend-design-direction`, `design-system`, `taste`.

**Design direction — LOCKED 2026-07-21** via multi-source research + benchmark; full spec in
[`apps/web/src/app/DESIGN.md`](../apps/web/src/app/DESIGN.md). Identity: **"Warm Paper, One Flow."**
- **Accent:** Eucalyptus/Sage `#6E9A78` (dark `#8CBE97`) — the single "flow" color: now-line, Big-3 star, primary action, re-flow motion. Two-step token (mid for fills, `#46654E`/`#A9D2B2` for accent text @ AA).
- **Type:** Geist (UI, tabular) + Fraunces (display, rationed to date header / win / reflection).
- **Base:** warm paper `#FAF8F2` + warm ink `#2C2B27`; warm-charcoal dark peer `#16181A`, light default, `prefers-color-scheme` honored.
- **Feel:** 12px radii, roomy, flat paper, hairline rules — no gradients/blobs/cards-in-cards.
- **Motion:** "Gentle Glide" ease-in-out FLIP (kept blocks don't move; accent bar sweeps moved ones).
- **Layout:** single vertical spine (mobile parity). **Mobile:** persistent capture pill + 2-tab shell.
- **Emotional:** "Whisper & Settle" copy + Daily-Arc comeback + one sun-on-horizon motif at the two peaks.

**Tasks:**
1. Rewrite `apps/web/src/app/globals.css`: proper CSS-variable token ramps (`--bg`, `--surface`, `--ink`, `--muted`, `--line`, `--accent` + scale, `--radius`, spacing/typography scale) for light and dark via `prefers-color-scheme`; **fix the `body { font-family: Arial }` bug** (use the Geist variable). Map tokens into Tailwind v4 `@theme`.
2. Add the display font in `layout.tsx` via `next/font/google` (self-hosted) with a `--font-display` variable.
3. Install the handful of shadcn/ui primitives we'll actually reuse (`npx shadcn add button input label switch dialog sheet select toast` — components.json is already configured, `new-york`/neutral). Re-skin their tokens to ours. Keep the set minimal (anti-bloat).
4. Create `src/components/ui/` wrappers only where the raw shadcn piece needs our tokens; document the token contract in a short `src/app/DESIGN.md`.
5. Refit the existing three surfaces (`page.tsx` landing, `login`, and the `today`/`inbox` *chrome* only — not full redesign yet) to the tokens so nothing looks half-migrated.

**Mobile:** set `viewport` with `viewport-fit=cover`; add safe-area CSS vars (`env(safe-area-inset-*)`); base type scale must be legible at 375px.

**Verify / exit:** tsc+lint+build green; light & dark both coherent; no raw hex left in the three refit surfaces; Lighthouse (mobile) first-load not regressed. `DECISIONS.md` records the type/color choices.

**Rollback:** token layer is additive; revert `globals.css` + `layout.tsx` to restore prior look.

---

## Phase 8 — Component & interaction system `[inline]`

**Goal:** extract the ad-hoc repeated Tailwind (chips, task cards, section headers, buttons, the timeline block)
into a small set of reusable, accessible components on the new tokens — so settings/editing/mobile phases compose
instead of copy-paste.

**Load skills:** `design-system`, `make-interfaces-feel-better`, `react-patterns`, `accessibility`.

**Tasks:**
1. `TaskCard`, `Chip`, `SectionHeader`, `PrimaryButton`/`QuietButton`, `EmptyState`, `Toast` host — one home each, used by inbox, today, settings.
2. Consistent focus-visible rings, keyboard affordances, `aria-label`s, and 44px min hit areas across them.
3. A `useToast` for the many silent success/failure spots that currently no-op (calendar sync, save, export) — calm, brief, dismissible; never alarmist.
4. Standardize loading/skeleton treatment (no spinner walls — subtle shimmer, per §8).

**Verify / exit:** inbox + today re-rendered through the components with zero behavior change (all Phase 1–6 interactions still work — trace each); axe-core clean on both routes; bundle size checked (`react-performance`).

**Rollback:** components are new files; the two screens can revert to inline markup per-hunk.

---

## Phase 9 — Settings & profile UI `[inline]` — *biggest functional gap*

**Goal:** let users edit what the scheduler already depends on — working hours, energy profile, default buffer,
display name, timezone — plus manage calendar + data. Until this exists, "energy-aware scheduling" is unpersonalized.

**Why:** the scheduler reads `profiles.energy_profile/working_hours/buffer` (Phase 3) but nothing writes them; they
sit at DB defaults. This unlocks the core promise for real users.

**Load skills:** `frontend-design-direction`, `accessibility`, `react-patterns`.

**Tasks:**
1. `src/app/settings/page.tsx` (server: load profile) + `settings-client.tsx`.
2. Working hours (time pickers), **energy profile editor** (visual: drag/select which hours are deep/shallow/admin — the marquee control, must be delightful and mobile-usable), default buffer, display name, timezone (with the existing browser-tz auto-sync surfaced).
3. Calendar connect/disconnect moved here (from the today footer) as its proper home; data export (JSON/iCal) lives here too.
4. Optimistic saves via the toast system; Zod-validated writes; RLS-scoped (user's own row).
5. Nav entry to settings from both inbox and today (see Phase 10 nav).

**Mobile:** the energy editor must work by touch (tap-drag across an hour grid); full-width controls; no hover-only affordances.

**Verify / exit:** editing energy hours changes a subsequent "Plan my day" placement (manual E2E note); tsc+lint+build green; a11y pass on the new form.

---

## Phase 10 — Task editing, projects, and mobile navigation `[workflow]`

**Goal:** three independent-enough streams that fan out well: (a) edit a task after capture, (b) projects CRUD +
assignment, (c) a real mobile navigation shell. Adversarial verify each.

**Why workflow:** (a) touches task detail UI, (b) touches a new projects area + inbox chips, (c) touches app-shell
layout — low file overlap, classic parallel fit. Pin the shared types first (inline scout) exactly like Phases 3–4.

**Load skills:** `frontend-design-direction`, `react-patterns`, `accessibility`; verifiers get `receiving-code-review`.

**Streams:**
- **A — Task editing:** a detail sheet/dialog (shadcn `sheet` on mobile, `dialog` on desktop) to edit title, notes, estimate, energy tag, deadline, priority, fixed-time, project. Optimistic; re-flows on change (existing `planDay(true)`).
- **B — Projects:** `src/app/projects/` list + create/rename/archive/color; assign from the task sheet; project chips become filters in inbox. Wire the AI's existing `suggested_project` to one-tap create.
- **C — Mobile nav shell:** a bottom tab bar (Capture · Today · Settings) on small screens, top nav on desktop; `viewport-fit=cover` safe-area padding; a persistent capture affordance reachable everywhere (§6 "always reachable omnibox"). Route-aware active states.

**Pinned first (inline):** any shared type/prop additions in `src/lib/types.ts`, the nav component's contract, and a `ProjectRow` type — so the three agents can't collide.

**Mobile:** stream C *is* the mobile story; A and B must render their sheets/lists at 375px.

**Verify / exit:** each stream adversarially verified (ownership honored, purity lint, no Phase 1–6 regressions, a11y, 375px); integrator runs the authoritative build.

---

## Phase 11 — Full mobile/PWA pass `[inline]`

**Goal:** make Reflow a real installable app on a phone, not a shrunk website.

**Load skills:** `frontend-design-direction`, `accessibility`, `browser-qa`.

**Tasks:**
1. **Generate real PWA icons** (192/512 + maskable + apple-touch) from a simple mark built on the accent — currently referenced but missing. `[you]` may be asked to approve the mark.
2. **Web App Manifest**: add `share_target` (POST/GET) so the OS share sheet can send text/links straight into the inbox (§6); add shortcuts (Capture, Today); set `theme_color`/`background_color` to the new tokens; `display: standalone`.
3. **Share-target route** `src/app/api/share/route.ts` (or a `/capture` handler) that drops shared content into the inbox and redirects.
4. **Responsive audit of every screen** at 320/375/414px: the `today` timeline (the hardest — vertical scroll, touch to place, pinch-free), inbox, settings, projects. Replace hover-only actions with tap-visible ones on touch.
5. **Offline shell**: a minimal service worker (or Next PWA pattern from bundled docs) caching the app shell so it opens offline and shows cached tasks; capture stays optimistic. Verify against `node_modules/next/dist/docs`.
6. Safe areas, 44px targets, momentum/keyboard-avoidance on inputs, `-webkit-tap-highlight` cleanup, no horizontal scroll anywhere.

**Verify / exit:** installs to home screen on Android/iOS; share-sheet capture works; Lighthouse PWA + mobile a11y ≥ 90; `browser-qa` screenshots at three widths attached to `DECISIONS.md`.

---

## Phase 12 — Motion, empty states & the emotional layer `[inline]`

**Goal:** the "impeccable" finish — make re-flow *feel* like healing, completion feel good, and empty states feel
inviting. This is where calm becomes memorable.

**Load skills:** `motion-ui`, `make-interfaces-feel-better`, `taste`, `loop-design-check`.

**Tasks:**
1. **Re-flow motion:** when the plan changes, blocks *glide* to new positions (FLIP/transform, respects `prefers-reduced-motion`) — the signature moment. Kept blocks stay put (reinforces stability); moved blocks animate. Never masks slowness (motion ≤ ~250ms).
2. **Completion moment:** a small, warm accent flourish on check-off and on the Big-3 win banner (confetti-free, calm).
3. **Empty states with intention:** inbox-zero, no-tasks-today, first-run (before any capture), no-momentum-yet — each a designed moment with one clear next action, not blank space.
4. **Now-line + wildcard + rolled** get their final visual treatment on the accent system.
5. **First-run onboarding whisper:** a one-line, dismissible guide toward the 60-second aha (capture → plan) — no modal wizard (anti-pattern per non-goals).

**Verify / exit:** reduced-motion honored; re-flow animation profiled (no jank, 60fps); `loop-design-check` pass; the CLAUDE.md §12 success moment (capture 3 → plan → re-flow, calm, no red) feels right on desktop and phone.

---

## Phase 13 — Verification: human walkthrough + automated E2E `[you]` + `[inline]`

**Goal:** prove the whole loop with a signed-in human and lock it with automated tests — the never-yet-done gap.

**Load skills:** `e2e-testing`, `browser-qa`, `windows-desktop-e2e`, `verification-before-completion`.

**Tasks:**
1. **`[you]` guided walkthrough:** sign in → capture (text + voice) → triage → set energy in settings → Plan my day → complete early → watch re-flow → connect Google Calendar (needs the redirect URI registered) → evening reflection → export → install PWA on phone. I provide a checklist; I fix whatever it surfaces.
2. **Playwright E2E** against a test Supabase user: the core loop, graceful-degradation paths (scheduler down, LLM 503), and mobile viewport runs. Wire into CI (`.github/workflows/ci.yml` exists — extend it).
3. **Accessibility audit** (axe) across all routes; fix violations.

**Verify / exit:** E2E green in CI on desktop + mobile viewport; a11y violations zero; founder sign-off on the walkthrough.

---

## Phase 14 — Deployment & launch hardening `[you]` + `[inline]`

**Goal:** live on the internet, on free tiers, verifiably healthy.

**Load skills:** `deployment-patterns`, `canary-watch`, `security-review`.

**Tasks:**
1. **Web → Vercel:** env vars set, `NEXT_PUBLIC_SITE_URL` → real domain.
2. **Scheduler → Railway/Fly.io free tier:** Dockerfile/proc, `GEMINI_API_KEY`, `SCHEDULER_URL` wired from web.
3. **OAuth + auth redirects for prod:** add prod callback to Google console + Supabase auth allowlist; Calendar API enabled.
4. **Secret rotation `[you]`:** rotate the three secrets that transited chat (Google client secret, Supabase secret key, Gemini key) — `security-review` checklist; update envs, never commit.
5. **`get_advisors` clean** (Supabase security + performance) against prod config.
6. **Post-deploy canary:** `canary-watch` on the live URL — health, core routes, SSE/none, console errors.
7. **README:** real setup + deploy docs; screenshots.

**Verify / exit:** a brand-new user can complete the §12 60-second success on the live URL from a phone. Canary green.

---

## Dependency graph & ordering

```
7 (design foundation) ─┬─> 8 (components) ─┬─> 9  (settings)      ─┐
                       │                   ├─> 10 (edit/proj/nav) ─┼─> 12 (motion/polish) ─> 13 (verify) ─> 14 (deploy)
                       │                   └─> 11 (mobile/PWA)    ─┘
                       └───────────────────────────────────────────┘
```

- **7 → 8** strictly serial (everything builds on tokens+components).
- **9, 10, 11** can overlap after 8 (10 is itself a workflow of 3 parallel streams; 9 and 11 are inline but touch mostly separate files — sequence 9 → 11 to be safe, or run 11 alongside 10's nav stream).
- **12** needs 9–11's surfaces to exist.
- **13, 14** are the closing serial gates; both have `[you]` steps.

**Rough size:** 8 phases. ~2 are heavy (7, 10), ~4 medium (8, 9, 11, 12), 2 are gates (13, 14). Founder touchpoints: icon-mark approval (11), the walkthrough (13), secret rotation + hosting accounts (14).

---

## What is explicitly NOT in this plan (parked by prior decisions)

- Stripe / paid tiers / gating (founder deferred, post-PMF).
- Weekly resurfacing **email** (in-app resurfacing shipped in Phase 5; email is later).
- Native iOS/Android apps, recurring-task polish, more integrations (CLAUDE.md post-MVP).
- Team/collaboration, notes/PKM, chat-as-primary-UX (permanent non-goals, CLAUDE.md §2).

---

## Execution note

Per the Hybrid choice: Phase 10 runs as a `Workflow` (3 build streams + adversarial verifiers), everything else
inline. Because subagent spawns have hit session usage limits twice, the workflow phase pins all shared contracts
inline first and each stream is self-contained, so any agent that dies can be finished inline from disk (proven
approach in Phases 3–4). Each phase ends the standard way: verify green → update README/DECISIONS → commit → push.
