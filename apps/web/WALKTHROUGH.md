# Reflow — signed-in walkthrough (the 60-second promise)

## Automated E2E first (Playwright)

Two suites live in [`e2e/`](e2e):

- **`smoke.spec.ts`** — public routes + graceful degradation. No auth, no
  secrets. This is what runs in CI (the `e2e` job) on desktop + a Pixel-7
  mobile viewport.
- **`core-loop.auth.spec.ts`** — the signed-in loop: capture → triage →
  place on the timeline → Big 3 → complete → the win banner, plus "Plan my day"
  degrading gracefully and the settings controls rendering. It seeds a
  confirmed test user with the Supabase **service key**, so it only runs where
  `SUPABASE_SECRET_KEY` is set (your `.env.local`); without it, these specs
  skip themselves.

```bash
cd apps/web
npx playwright install chromium   # first time only
# against a running dev/prod server (reuses one on :3000):
E2E_BASE_URL=http://localhost:3000 npm run test:e2e
# or let Playwright build+start it for you:
npm run build && npm run test:e2e
```

The signed-in specs write to (and clean up after themselves in) the dev
Supabase project under a dedicated `e2e-runner@reflow.test` account —
override with `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD`. Point them at a scratch
project before running against anything precious.

## Then the human pass

The one thing automated tests can't do: confirm the whole loop *feels* right
with a real session. Run this once locally (and again on the live URL after
deploy). Both services must be up:

```bash
# terminal 1 — scheduler (venv ready; port 8001 on this machine)
cd services/scheduler && .venv/Scripts/python -m uvicorn app.main:app --port 8001
# terminal 2 — web
cd apps/web && npm run dev
```

Open http://localhost:3000 and sign in (magic link to your email).

## The core loop
- [ ] **Capture** — dump 3 things in the box (try the mic 🎙 too). Each appears
      instantly; a moment later the AI adds an estimate / energy / deadline chip.
- [ ] **Edit** — click a task's title → the sheet opens → tweak the estimate → Save.
- [ ] **Triage** — `t` (today) / `l` (later) / `x` (drop), or the buttons.
- [ ] **Projects** — make one on /projects, assign it from a task's edit sheet,
      then filter the inbox by it. If the AI suggested a project, one-tap the
      dashed `+ #name` chip to create + assign it. Archiving/deleting a project
      never deletes its tasks.
- [ ] **Settings** — set your working hours and *paint* a couple of Deep hours in
      the energy grid; Save.
- [ ] **Plan my day** — on /today, hit it. Tasks land around fixed blocks; deep
      work should prefer the hours you painted. A wildcard "breathing room" lane appears.
- [ ] **Self-heal** — mark a task done early → the plan quietly re-flows; kept
      blocks don't move, moved ones glide. **No red, no overdue.**
- [ ] **Big 3** — star three tasks; finish them → the win banner sweeps in.
- [ ] **Reflection** — in the evening (or temporarily set working-hours end near
      now), the "close the day" reflection appears.

## Optional day tasks (bonus work)
- [ ] On /today, add something in **Optional today** → it appears instantly.
      Check it off, then delete it with the ✕.
- [ ] Confirm it never enters the "To place" tray, never gets a timeline block,
      and doesn't move the day's completion ring or workload meter.
- [ ] Leave one undone overnight → tomorrow it's simply gone. No roll-forward,
      no badge, no guilt.

## Habits — editing
- [ ] On /habits, tap the ✏️ on a habit → rename it, change its icon, colour or
      type → Save.
- [ ] In the same sheet, **delete this habit** → confirm → it goes, and its
      check-in history goes with it.

## Navigation
- [ ] On a phone, the bottom bar shows Today · Inbox · Habits · Settings ·
      **More**. Tap **More** → Projects, Week, Focus, Journal, Progress.
- [ ] The reflection ("close the day") is reachable any time, not just evening.

## Mobile / PWA (use a phone or DevTools device mode)
- [ ] Bottom tab bar (Today / Inbox / Settings); capture reachable one-handed.
- [ ] No horizontal scroll at 375px; touch targets comfortable.
- [ ] Add to Home Screen → launches standalone with the sage icon.
- [ ] Share text from another app → it lands in the Reflow inbox.

## What to report back
Anything that felt slow, looked off, or made you feel *behind*. The bar is
**fast, forgiving, frictionless** — flag anything that misses it.
