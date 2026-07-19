# Reflow — Market & Technical Research Report

*Date: 2026-07-19 · Sources: 24 unique · Confidence: Medium-High (competitive), High (technical)*

## Executive Summary

The 2026 AI-planner market is crowded at the top (Motion, Reclaim, Sunsama) but the incumbents validate — rather than close — Reflow's wedge. Motion, the category leader, is persistently criticized for being slow, bloated, expensive, and clunky on mobile; Sunsama is loved but demands a daily 10–15 minute manual ritual at $20/mo and collapses when users skip it; Reclaim (now a Dropbox product) is calendar-defense, not day-planning. A budget tier of deterministic auto-schedulers (FlowSavvy, Trevor AI) proves users want exactly what Reflow's engine does — instant recalculation of a broken day — but none of them pair it with capture-first onboarding or a no-guilt emotional layer. Meanwhile, current writing on productivity-app abandonment confirms the guilt mechanic ("17 overdue tasks means the mental cost of opening the app exceeds not opening it") as the stage most users never recover from. On the technical side: every architectural bet in the spec is supported by current best practice — greedy interval scheduling is the right deterministic core, Anthropic structured outputs now give schema-guaranteed JSON for `/parse`, Supabase RLS has well-documented performance patterns, and Google Calendar sync pitfalls (channel expiry, empty webhook payloads, sync-token invalidation) are known and plannable.

---

## Track 1 — Competitive Landscape (2026)

### 1.1 The incumbents

| Product | 2026 pricing | Approach | Documented weaknesses |
|---|---|---|---|
| **Motion** | Pro AI $19/seat/mo, Business AI $29/seat/mo (annual); reviewers cite $34–49/mo monthly tiers | Full auto-scheduling AI workspace (tasks, projects, docs, meetings) | "Too slow", "terrible bloat" from trend-chasing, "janky/clunky" UI, difficult onboarding, weak mobile app, repeated price hikes |
| **Reclaim.ai** (Dropbox) | Free Lite tier; paid from ~$8–10/seat/mo | Calendar defense: habits, focus time, buffer around meetings | Google/Outlook calendar-centric, not a day-planner; team growth mostly frozen since 2024 acquisition (22→23 people) |
| **Sunsama** | $20/mo annual, $25 monthly; new Power Pro at $50–65/mo | Mindful manual daily-planning ritual | "Most expensive subscription I have"; requires 10–15 min/day or it "collects dust"; no auto-scheduling; outdated UI, weak mobile |
| **Todoist** | Pro/Business for AI features | Lists + AI assist (task breakdown, Ramble voice capture via Gemini, email extraction) | Deliberately does NOT auto-schedule; "human picks, AI helps busywork" |
| **Akiflow** | Premium-priced consolidation tool | Inbox consolidation + manual time-blocking | Manual placement; no self-healing |
| **Structured** | Freemium mobile-first | Visual timeline day planner | Manual; no re-flow engine |

Key sources: [Temporal comparison](https://temporal.day/blog/motion-vs-reclaim-vs-clockwise-vs-akiflow-vs-sunsama), [Saner.ai Motion review](https://www.saner.ai/blogs/motion-reviews), [Efficient App Motion review](https://efficient.app/apps/motion), [TheBusinessDive Sunsama review](https://thebusinessdive.com/sunsama-review), [Reclaim × Dropbox](https://reclaim.ai/blog/dropbox-acquires-reclaim), [TechCrunch on the acquisition](https://techcrunch.com/2024/08/22/dropbox-acquires-index-ventures-backed-ai-scheduling-tool-reclaim-ai/), [Todoist AI review](https://pick-right.com/tools/todoist-ai/), [Morgen on Sunsama pricing](https://www.morgen.so/blog-posts/sunsama-pricing).

### 1.2 The budget deterministic tier (closest to Reflow's engine)

- **FlowSavvy** — free forever + Pro; auto-splits tasks that don't fit, balances load across days, and "if you get behind, hit recalculate and it instantly reschedules missed tasks." This is direct proof of demand for deterministic self-healing ([flowsavvy.app](https://flowsavvy.app/), [Product Hunt reviews](https://www.producthunt.com/products/flowsavvy/reviews)).
- **Trevor AI** — $5/mo; schedules a to-do list into Google Calendar with duration prediction, but *does not auto-reschedule* — a user quote: "I was using Trevor AI and liked it a lot, but doesn't auto re-schedule. Now I'm trying FlowSavvy" ([ToolsCompare](https://toolscompare.ai/tool/trevor-ai), [Slashdot comparison](https://slashdot.org/software/comparison/FlowSavvy-vs-Trevor-AI/)).

Neither pairs the engine with (a) friction-free NL capture, (b) a Big-3/no-guilt layer, or (c) polished product design — they compete on price, not feel.

### 1.3 New entrants & market shifts

- A wave of 2025–26 entrants (Temporal, alfred_, Ellie, Arahi, Lifestack, Saner.ai) is attacking Motion on price/simplicity — each publishing "Motion alternatives" SEO content, which itself signals widespread Motion dissatisfaction ([Lindy roundup](https://www.lindy.ai/blog/ai-daily-planner), [alfred_ Motion alternatives](https://get-alfred.ai/blog/best-motion-alternatives)).
- Trend: category drifting toward "full workflow orchestration" (agents booking travel, drafting email) ([Jenova](https://www.jenova.ai/en/resources/ai-schedule-planner-202605)) — i.e., competitors are adding more LLM in the hot path, which increases their latency/cost surface while Reflow stays deterministic.
- Todoist launched **Ramble** (voice-to-task, Jan 2026, Gemini 2.5 Flash Live) — validates NL/voice capture at the edges as mainstream ([Todoist AI review](https://pick-right.com/tools/todoist-ai/)).

### 1.4 The guilt/abandonment evidence

- Productivity apps "manufacture a brand new anxiety, then sell features to manage it"; overdue tasks "slowly turning red" are called out as a core failure ([Medium, Jun 2026](https://medium.com/@anshraj7/productivity-apps-didnt-make-us-productive-they-made-us-anxious-about-not-being-3c27f305f41e)).
- "When an app has 17 overdue tasks, the mental cost of opening it exceeds the cost of not opening it… this is the stage most people never recover from" ([Ardent Workshop — 9 Stages of a Productivity App](https://www.ardentworkshop.com/blog/stages-of-productivity-app/)).
- Most productivity-app habits are abandoned in week two or three, before the behavior takes root ([Android Authority](https://www.androidauthority.com/productivity-apps-failed-3639859/)).

### 1.5 Verdict on the wedge

**The wedge holds.** No 2026 incumbent combines: deterministic sub-second self-healing + one-second capture + explicitly anti-guilt mechanics + honest pricing. Nearest threats: FlowSavvy (engine, no emotional layer/polish) and a hypothetical Motion "lite" tier (no sign of one; Motion is moving upmarket toward AI-employee bundles). Positioning risks to watch: (1) FlowSavvy adding polish, (2) Todoist adding auto-scheduling — its stated philosophy says it won't, (3) "AI orchestration" reframing user expectations toward agents.

---

## Track 2 — Technical Findings

### 2.1 Deterministic scheduling

Classic greedy interval scheduling (sort by earliest finish; O(n log n)) is the well-studied foundation ([Wikipedia](https://en.wikipedia.org/wiki/Interval_scheduling), [Kleinberg–Tardos ch. 4](https://www.cs.princeton.edu/~wayne/kleinberg-tardos/pearson/04GreedyAlgorithms-2x2.pdf), [UMD CMSC451 notes](https://www.cs.umd.edu/class/spring2025/cmsc451-0101/Lects/lect05-greedy-sched.pdf)). Reflow's variant is *placement into free intervals with priority ranking* rather than max-set selection, so the relevant lessons are: sort/rank once, greedily place, never backtrack in the hot path; earliest-finish-style heuristics beat earliest-start/shortest-first pathologies. Dynamic single-machine interval scheduling literature ([arXiv:1412.8005](https://arxiv.org/pdf/1412.8005)) supports incremental re-flow (only recompute affected suffix) — matching the spec's stability requirement. FlowSavvy demonstrates commercially that <1s full-recalculate is achievable and valued.

### 2.2 Next.js PWA capture

- Use **Serwist** for the service worker on Next.js App Router; app-shell Cache First, API data Stale-While-Revalidate, must-be-fresh Network First ([LogRocket Next.js 16 PWA guide](https://blog.logrocket.com/nextjs-16-pwa-offline-support/), [Next.js PWA guide](https://nextjs.org/docs/app/guides/progressive-web-apps)).
- Offline-capable optimistic capture pattern: UI → IndexedDB write → sync queue → background sync → API → reconciliation ([Fishtank](https://www.getfishtank.com/insights/building-native-like-offline-experience-in-nextjs-pwas), [WellAlly tutorial](https://www.wellally.tech/blog/build-offline-first-pwa-nextjs-indexeddb)). Exactly matches the spec's "item appears before any network round-trip."
- `share_target` in the manifest turns the PWA into an OS share-sheet target for capture (Android/desktop Chrome; iOS Safari still doesn't support share_target — voice/text capture must carry iOS).

### 2.3 Supabase RLS (from official docs, read in full)

- RLS **must** be enabled on every table in an exposed schema; tables created via raw SQL do *not* get it automatically ([Supabase RLS docs](https://supabase.com/docs/guides/database/postgres/row-level-security)).
- Performance: write policies as `(select auth.uid()) = user_id` — the initPlan caches the result per-statement instead of per-row; always `TO authenticated`; index every column referenced in a policy ([RLS performance troubleshooting](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv)).
- Never gate on `user_metadata` (user-modifiable). Advisor lint 0007 catches policy-without-RLS misconfigurations; run advisors after every DDL change.
- pgTAP + `basejump-supabase_test_helpers` provide `tests.rls_enabled('public')` for schema-wide RLS verification in CI ([pgTAP guide](https://supabase.com/docs/guides/local-development/testing/pgtap-extended)).

### 2.4 Google Calendar sync (Phase 4 planning)

- **Incremental sync**: store `syncToken` per calendar; on HTTP 410 GONE, wipe and full-resync ([Google sync guide](https://developers.google.com/workspace/calendar/api/guides/sync)).
- **Webhooks are hints, not payloads**: notification says "something changed"; you must list-with-token to learn what. Channels expire in ~7 days with **no auto-renewal** — build renewal from day one; expect duplicate notifications (dedupe by resource ID + token) ([Nango guide](https://nango.dev/blog/how-to-build-a-real-time-google-calendar-api-integration/), [CalendHub](https://calendhub.com/blog/implement-bidirectional-calendar-sync-2025/)).
- Google's own docs note push is "not 100% reliable" → hybrid: webhooks + hourly incremental poll with the same sync token ([SyncDate](https://syncdate.app/blog/how-calendar-sync-works)).
- Bidirectional loop-prevention: tag Reflow-written events with metadata (extended properties) and ignore webhook echoes of your own writes.

### 2.5 Anthropic structured output for `/parse`

- **Structured outputs are GA** (no beta header): pass a JSON Schema via `output_config.format`, or `strict: true` on a tool definition — output is constrained at sampling time, so the §6 `/parse` contract can be *guaranteed*, not just prompted ([Anthropic docs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs), [Anthropic blog](https://claude.com/blog/structured-outputs-on-the-claude-developer-platform)).
- Compiled grammars cache for 24h, so repeat `/parse` calls aren't slowed ([Towards Data Science hands-on](https://towardsdatascience.com/hands-on-with-anthropics-new-structured-output-capabilities/)).
- Still validate with Pydantic/Zod at the boundary (defense in depth, and schema-valid ≠ semantically sensible — e.g. a deadline in the past).
- Use Haiku-class models for `/parse` (cheap, fast); reserve larger models for `/reflect`.

---

## Key Takeaways (what changes in the build)

1. **Build exactly the spec** — research contradicts none of it. Speed + forgiveness + capture remain the open wedge.
2. Treat **FlowSavvy** as the closest competitor to study; differentiate on capture UX, no-guilt layer, and design quality — not on engine features.
3. Use **Anthropic structured outputs (`output_config.format`)** for `/parse` instead of prompt-only JSON — stronger guarantee than the spec assumed.
4. RLS: `(select auth.uid())`, `TO authenticated`, index `user_id` everywhere, run Supabase advisors after every migration, pgTAP RLS check in CI later.
5. PWA: Serwist + IndexedDB queue for offline capture; plan around iOS's missing `share_target`.
6. Phase 4 calendar sync must budget for: channel renewal infra, dedupe, hybrid poll fallback, 410 full-resync, and echo suppression.

## Methodology

10 web search queries (July 2026) across both tracks; 1 full deep-read via Supabase MCP docs search. **Limitation:** direct page fetches (WebFetch) were blocked by this environment's egress proxy (HTTP 403) for temporal.day, efficient.app, ardentworkshop.com, developers.google.com, supabase.com and nango.dev, so most competitive claims rest on search-result aggregation of those pages rather than full-text reads — treat specific pricing figures as approximate and re-verify before publishing any comparison marketing. Sub-questions on scheduling algorithms, RLS, structured outputs, and GCal sync were answered with high confidence; per-app 2026 churn/revenue data was not findable (private companies).
