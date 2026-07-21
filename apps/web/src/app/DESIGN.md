# Reflow — Design System: "Warm Paper, One Flow"

The canonical visual spec. Chosen via multi-source research + benchmark (2026-07-21).
Every UI surface reuses these tokens; no raw hex, no ad-hoc spacing. When a choice
isn't here, prefer the option that is calmer, faster, and works one-handed on a phone.

## The one idea

A single restorative **sage** accent is *the flow* — it threads capture → plan → heal.
It is the only saturated color on screen, reserved for: the **now-line**, the **Big-3 star**,
the **primary action**, and **re-flow motion**. Everything else is warm paper + warm ink.
It reads as *forgiveness, not hustle* — the tool you open when overwhelmed.

---

## 1. Color tokens

Warm paper base, warm ink foreground, one sage accent as a two-step token (a vivid mid
for markers/fills/motion, a darkened step for any accent-colored *text* so it clears WCAG
AA 4.5:1). Dark mode is warm charcoal (red/yellow tint), never blue-black; the accent
lightens ~15–20% L to hold AA on dark. Flat — no gradients, no blobs, no cards-in-cards.

### Light (default)
| Token | Hex | Use |
|---|---|---|
| `--paper` | `#FAF8F2` | app background |
| `--surface` | `#FFFDF8` | raised surfaces (sheet, dialog, focus card) — used sparingly |
| `--ink` | `#2C2B27` | primary text, filled controls |
| `--muted` | `#6B6862` | secondary text |
| `--faint` | `#9A968E` | tertiary text, placeholders, hour labels |
| `--line` | `#E7E2D5` | hairline separators (ink @ ~8%) |
| `--line-strong` | `#D9D2C3` | stronger dividers |
| `--accent` | `#6E9A78` | now-line, Big-3 star, primary fill, motion |
| `--accent-strong` | `#5E8768` | accent hover/press |
| `--accent-text` | `#46654E` | accent-colored *text* (AA on paper) |
| `--accent-tint` | `#E7EFE7` | subtle accent fills, wildcard lane |

### Dark (system peer — fully designed, not an afterthought)
| Token | Hex | Use |
|---|---|---|
| `--paper` | `#16181A` | app background |
| `--surface` | `#1E2123` | raised surfaces |
| `--ink` | `#E9E7DF` | primary text |
| `--muted` | `#A8A49B` | secondary text |
| `--faint` | `#6F6C64` | tertiary text, hour labels |
| `--line` | `#2A2D30` | hairline separators |
| `--line-strong` | `#383B3E` | stronger dividers |
| `--accent` | `#8CBE97` | now-line, star, primary fill, motion |
| `--accent-strong` | `#7BAE86` | accent hover/press |
| `--accent-text` | `#A9D2B2` | accent-colored text (AA on charcoal) |
| `--accent-tint` | `rgba(140,190,151,0.12)` | subtle accent fills |

**Semantic discipline:** completion is *not* signalled by hue (sage already means "flow"),
but by weight + a drawn checkmark + strikethrough in `--faint`. **No red, ever** — nothing
overdue, nothing shamed. There is no "error/warning" color in the task surface.

**Theme mechanics:** default light; follow `prefers-color-scheme`; a manual toggle stamps
`data-theme="light|dark"` on `<html>` and always wins.

---

## 2. Typography

**UI face — Geist** (already installed, self-hosted, tabular figures): the whole time grid,
all controls, all body. Tabular numerals are load-bearing — time labels must never jitter.
**Display face — Fraunces** (warm old-style serif, `next/font`, self-hosted): rationed to the
few emotional beats only — the **date header**, the **Big-3 win banner**, the **reflection**.
Warmth is scarce on purpose.

| Role | Font | Size / line-height | Weight | Notes |
|---|---|---|---|---|
| Date header | Fraunces | 40 / 1.05 (30 mobile) | ~360 | high optical size, warm |
| Win / reflection | Fraunces *italic* | 22–28 / 1.3 | 400 | the only italic in the app |
| Page title | Geist | 24 / 1.2 | 520 | calm bold, never 700 |
| Section label | Geist | 13 / 1.3 | 500 | `--muted`, slight tracking, uppercase optional |
| Body | Geist | 15–16 / 1.5 | 400 | |
| Meta / chip | Geist | 12–13 / 1.4 | 400 | `--muted` |
| Time label | Geist | 12 / 1 | 400 | `.tabular` (tnum), `--faint` |

`.tabular { font-feature-settings: "tnum" 1, "cv01" 1; font-variant-numeric: tabular-nums; }`
Preload only Geist 400/500; load Fraunces `display:swap`, async. Latin subset, woff2.

---

## 3. Space, radius, density — "soft-calm, roomy, flat"

| Token | Value | Use |
|---|---|---|
| `--radius` | `12px` | task/timeline blocks |
| `--radius-lg` | `16px` | cards, sheets, dialogs |
| `--radius-sm` | `8px` | chips, buttons, inputs |
| `--radius-pill` | `999px` | the capture pill, momentum dots |
| `--pad-block` | `12px` | inner padding of a block |
| `--row-hour` | `64px` desktop / `52px` mobile | timeline hour height → px/min ≈ 1.07 / 0.87 |
| `--rail` | `2px` | accent left-rail on flexible blocks |

Spacing rhythm: 4 / 8 / 12 / 16 / 24 / 32. Whitespace is a feature — don't pack the day.
Hairlines over boxes: no border where fill-weight already separates. Never nest a card in a
card. Flat warm paper; the only "texture" is hairline rules at ~8% ink.

---

## 4. Motion — "Gentle Glide" (the re-flow signature)

The signature moment is the plan **healing**: when it re-flows, only blocks that must move
do, and they **glide** on a decisive ease-in-out; blocks that didn't change get **zero
transform** ("what stayed, stayed"). An accent left-edge bar sweeps each re-flowed block and
fades — the accent literally *is* the flow. Transform + opacity only (GPU-cheap).

| Token | Value |
|---|---|
| `--ease-flow` (on-screen movement / FLIP) | `cubic-bezier(0.77, 0, 0.175, 1)` |
| `--ease-out` (enter / exit) | `cubic-bezier(0.23, 1, 0.32, 1)` |
| `--dur-flow` | `340ms` (40ms stagger between blocks) |
| `--dur-enter` | `200ms` |
| `--dur-tick` (check-off draw-on) | `160ms` |
| `--dur-sweep` (accent bar fade) | `500ms` |

**Check-off** = a confident tick draw-on ≤180ms + the row settling away. **No confetti** —
scale celebration to the event (a milestone gets a bigger moment, a task does not).
**`prefers-reduced-motion` / low-end floor:** cross-fade + 8px shift ≤180ms, no travel; the
now-line still moves. This fallback is mandatory regardless of the flagship path.

---

## 5. Day view — single vertical spine

One vertical time-spine, **identical on desktop and phone**. Fixed events, flexible blocks,
breathing-room gaps, and wildcard reserves all live inline on the same rail. The **sage
now-line is deliberately the single brightest element on screen.**

- **Fixed event:** filled `--surface`, no accent rail, small source tag (e.g. `· gcal`).
- **Flexible block:** `--rail` accent left-edge; title + duration + optional ★.
- **Done:** `--faint` text, strikethrough, drawn check — no hue change.
- **Wildcard / open:** dashed `--accent-tint` lane labelled "breathing room" — a feature, not a void.
- **Now-line:** 1px `--accent` full-bleed with a small node at the gutter; the only bright line.
- Left **time gutter**: tabular hour labels in `--faint`.
- Optional **"Now / Next" focus card** may pin above the spine (current block, time left,
  one-tap Done) — a later enhancement, consistent with the spine.
- Inbox/overflow is a **slide-up sheet**, never a permanent second column (mobile parity).

---

## 6. Mobile shell — persistent capture + 2-tab

- A fixed **warm-paper capture pill** (accent send arrow ➤) pinned just above a minimal
  bottom nav (**Today · Inbox · Momentum**). The one-second capture box is *always under the
  thumb* — no FAB hunt, no hidden gesture. Tap → snap-point **bottom sheet** (Vaul) for
  optional enrichment (peek = title only, matching "zero required fields").
- Pill collapses to a slim bar on scroll-down, re-expands on scroll-up.
- Opaque paper (take iOS-26 floating form, reject its translucency — legibility first).
- **Drag-to-schedule is an optional power gesture**; tap-a-gap / nudge buttons are the primary
  path (WCAG 2.5.7 needs a non-drag alternative; the engine already places blocks).
- `viewport-fit=cover` + `env(safe-area-inset-*)`; touch targets ≥ 44px; no horizontal scroll.

---

## 7. Emotional layer — "Whisper & Settle" + Daily Arc

- **Everyday empty states:** one balanced line of ink-on-paper copy + one quiet action.
  Warmth comes from crafted microcopy and the accent, not illustration.
  - Inbox zero → "Inbox clear. Nice. You're caught up — go do the day."
  - Big-3 done → accent underline sweeps L→R: "That's your three. The day's a win."
- **Daily Arc (the emotional system):** guilt-neutral day-cycle — a sub-60s, skippable
  startup ritual (pick up to three), a soft shutdown (reflect + roll forward), and a hero
  **comeback** screen: "Welcome back. 12 of the last 20 days. That counts."
- **One restorative motif** — a sun cresting a horizon, in the sage accent — reserved for the
  **two true peaks only**: inbox-zero and the Big-3 win. Nowhere else.
- **Momentum** = a never-resetting heatmap: filled = showed up, 45° diagonal = rest/freeze,
  calm gap = a quiet miss. Dims, never resets to zero. **No red overdue badge anywhere.**

---

## 8. Accessibility floor

WCAG 2.2 AA: body text ≥ 4.5:1 (accent-text tokens exist for this), large text ≥ 3:1,
targets ≥ 44px, visible `:focus-visible` rings (accent), `prefers-reduced-motion` honored,
full keyboard paths, discriminable-without-color (weight + icon + strike carry state).
