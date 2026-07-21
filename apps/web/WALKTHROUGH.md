# Reflow — signed-in walkthrough (the 60-second promise)

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
- [ ] **Settings** — set your working hours and *paint* a couple of Deep hours in
      the energy grid; Save.
- [ ] **Plan my day** — on /today, hit it. Tasks land around fixed blocks; deep
      work should prefer the hours you painted. A wildcard "breathing room" lane appears.
- [ ] **Self-heal** — mark a task done early → the plan quietly re-flows; kept
      blocks don't move, moved ones glide. **No red, no overdue.**
- [ ] **Big 3** — star three tasks; finish them → the win banner sweeps in.
- [ ] **Reflection** — in the evening (or temporarily set working-hours end near
      now), the "close the day" reflection appears.

## Calendar (optional — needs Google env + redirect URI registered)
- [ ] Connect Google Calendar from Settings → your events show as fixed blocks →
      Plan flows around them → your planned blocks appear on Google Calendar.

## Mobile / PWA (use a phone or DevTools device mode)
- [ ] Bottom tab bar (Today / Inbox / Settings); capture reachable one-handed.
- [ ] No horizontal scroll at 375px; touch targets comfortable.
- [ ] Add to Home Screen → launches standalone with the sage icon.
- [ ] Share text from another app → it lands in the Reflow inbox.

## What to report back
Anything that felt slow, looked off, or made you feel *behind*. The bar is
**fast, forgiving, frictionless** — flag anything that misses it.
