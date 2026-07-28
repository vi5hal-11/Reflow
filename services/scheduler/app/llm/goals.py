"""Goal & habit suggestion — an LLM edge (CLAUDE.md §1: LLM at the edges only).

From a light onboarding questionnaire we ask Gemini to propose a small set of
goals, each grouping a few concrete habits. The engine never depends on this: a
deterministic fallback always produces something usable.

The rule that matters here: **give the user what they actually asked for.** An
earlier version hard-coded a bias toward tiny, gentle habits ("prefer keystone
habits the user could keep on a bad day"), so someone asking for a serious
training block got back "walk after lunch". The user's own words and their
stated intensity now drive the shape of the result — including the fallback,
which used to ignore both.
"""

import httpx
from pydantic import BaseModel, Field, ValidationError

from . import gemini

COLORS = ["sage", "blue", "violet", "teal", "amber", "clay"]
ICONS = ["sparkles", "brain", "book", "droplet", "sunrise", "footprints", "heart", "dumbbell", "moon"]
KINDS = ["habit", "meditation", "workout"]
INTENSITIES = ["gentle", "steady", "ambitious"]

# How hard the plan should push. Passed to the model verbatim so the ladder is
# explicit rather than something it has to infer from adjectives.
_INTENSITY_BRIEF = {
    "gentle": (
        "Keep it small and low-friction — habits that survive a bad day. Short "
        "sessions, modest frequency, nothing that needs a good week to hold."
    ),
    "steady": (
        "A real, sustainable routine: meaningful volume the user can hold in a "
        "normal week. Name specific durations and frequencies."
    ),
    "ambitious": (
        "A demanding, structured programme. High volume, real specificity and "
        "progression are CORRECT here — do NOT soften it into something gentle."
    ),
}

SYSTEM_PROMPT = f"""You design a starter set of goals and habits for a calm, no-guilt planner.

The user has told you what they want. Give them THAT, shaped to the ambition they
stated — never a watered-down substitute.

Hard rules:
- FOLLOW THE USER'S INSTRUCTION. If they ask for a serious training programme,
  design a serious training programme. If they ask for something small, keep it
  small. Never replace what they asked for with your own idea of what is sensible
  or achievable for them.
- STAY ON THEIR SUBJECT. If they said "workout", the habits are workouts — not
  adjacent wellness habits like hydration or sleep, unless they asked for those.
- Habits must be CONCRETE and checkable at the end of a day: name the action and
  its size ("45-minute strength session", "run 5k", "read 10 pages"). Never vague
  ("be healthier", "get fit", "move more").
- Honour anything the user lists under Constraints — time available, injuries,
  equipment, schedule. Constraints shape the plan; they do not cancel the ambition.
- Propose 2-3 goals, each grouping 2-4 habits.
- Warm, plain language. Never shame the user or imply they are behind. No exclamation marks.
- Each goal.color and habit.color MUST be one of: {", ".join(COLORS)}.
- Each habit.icon MUST be one of: {", ".join(ICONS)}.
- Each habit.kind MUST be one of: {", ".join(KINDS)} — use "meditation" only for
  sitting/breathing practices, "workout" only for movement/exercise, otherwise "habit".
- cadence is "daily" or "weekly"."""

SUGGEST_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "goals": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "title": {"type": "STRING"},
                    "color": {"type": "STRING", "enum": COLORS},
                    "habits": {
                        "type": "ARRAY",
                        "items": {
                            "type": "OBJECT",
                            "properties": {
                                "title": {"type": "STRING"},
                                "kind": {"type": "STRING", "enum": KINDS},
                                "icon": {"type": "STRING", "enum": ICONS},
                                "color": {"type": "STRING", "enum": COLORS},
                                "cadence": {"type": "STRING", "enum": ["daily", "weekly"]},
                            },
                            "required": ["title", "kind", "icon", "color", "cadence"],
                        },
                    },
                },
                "required": ["title", "color", "habits"],
            },
        }
    },
    "required": ["goals"],
}


class SuggestGoalsRequest(BaseModel):
    focus_areas: list[str] = Field(default_factory=list, max_length=8)
    aspiration: str | None = Field(default=None, max_length=500)
    constraints: str | None = Field(default=None, max_length=500)
    # How hard to push. Drives both the prompt and the deterministic fallback.
    intensity: str = "steady"
    existing_habits: list[str] = Field(default_factory=list, max_length=50)


class SuggestedHabit(BaseModel):
    title: str = Field(max_length=120)
    kind: str = "habit"
    icon: str = "sparkles"
    color: str = "sage"
    cadence: str = "daily"


class SuggestedGoal(BaseModel):
    title: str = Field(max_length=120)
    color: str = "sage"
    habits: list[SuggestedHabit] = Field(default_factory=list, max_length=5)


class SuggestGoalsResponse(BaseModel):
    goals: list[SuggestedGoal] = Field(default_factory=list, max_length=4)
    source: str  # "llm" | "fallback"


# Deterministic starter sets — used when the LLM is unreachable, and the shape we
# want it to echo. Keyed by focus area *and* intensity so the fallback can never
# flatten an ambitious ask into a gentle one (the original bug).
_STARTERS: dict[str, dict[str, SuggestedGoal]] = {
    "health": {
        "gentle": SuggestedGoal(
            title="Feel better in my body",
            color="clay",
            habits=[
                SuggestedHabit(title="Walk after lunch", kind="workout", icon="footprints", color="clay"),
                SuggestedHabit(title="Drink a glass of water on waking", icon="droplet", color="blue"),
            ],
        ),
        "steady": SuggestedGoal(
            title="Train consistently",
            color="clay",
            habits=[
                SuggestedHabit(title="30-minute workout, 4x a week", kind="workout", icon="dumbbell", color="clay", cadence="weekly"),
                SuggestedHabit(title="Walk 20 minutes", kind="workout", icon="footprints", color="amber"),
            ],
        ),
        "ambitious": SuggestedGoal(
            title="Get seriously fit",
            color="clay",
            habits=[
                SuggestedHabit(title="45-minute strength session, 5x a week", kind="workout", icon="dumbbell", color="clay", cadence="weekly"),
                SuggestedHabit(title="Run 5k, 3x a week", kind="workout", icon="footprints", color="amber", cadence="weekly"),
                SuggestedHabit(title="Protein with every meal", icon="heart", color="sage"),
            ],
        ),
    },
    "focus": {
        "gentle": SuggestedGoal(
            title="Do the work that matters",
            color="violet",
            habits=[
                SuggestedHabit(title="One 25-minute focus block", icon="brain", color="violet"),
                SuggestedHabit(title="Read 10 minutes", icon="book", color="teal"),
            ],
        ),
        "steady": SuggestedGoal(
            title="Do the work that matters",
            color="violet",
            habits=[
                SuggestedHabit(title="One 90-minute deep-work block before noon", icon="brain", color="violet"),
                SuggestedHabit(title="Read 20 pages", icon="book", color="teal"),
            ],
        ),
        "ambitious": SuggestedGoal(
            title="Ship serious work every day",
            color="violet",
            habits=[
                SuggestedHabit(title="Two 90-minute deep-work blocks", icon="brain", color="violet"),
                SuggestedHabit(title="Phone in another room until noon", icon="sparkles", color="blue"),
                SuggestedHabit(title="Read 30 pages", icon="book", color="teal"),
            ],
        ),
    },
    "calm": {
        "gentle": SuggestedGoal(
            title="Carry less tension",
            color="teal",
            habits=[
                SuggestedHabit(title="Sit for 5 minutes", kind="meditation", icon="brain", color="teal"),
                SuggestedHabit(title="Wind down screen-free", icon="moon", color="violet"),
            ],
        ),
        "steady": SuggestedGoal(
            title="Carry less tension",
            color="teal",
            habits=[
                SuggestedHabit(title="Sit for 15 minutes", kind="meditation", icon="brain", color="teal"),
                SuggestedHabit(title="Wind down screen-free for an hour", icon="moon", color="violet"),
            ],
        ),
        "ambitious": SuggestedGoal(
            title="Build a real practice",
            color="teal",
            habits=[
                SuggestedHabit(title="Sit for 30 minutes each morning", kind="meditation", icon="brain", color="teal"),
                SuggestedHabit(title="Ten minutes of breathwork at midday", kind="meditation", icon="droplet", color="blue"),
                SuggestedHabit(title="Screen-free from 9pm", icon="moon", color="violet"),
            ],
        ),
    },
    "rest": {
        "gentle": SuggestedGoal(
            title="Rest on purpose",
            color="blue",
            habits=[
                SuggestedHabit(title="Lights out by a set time", icon="moon", color="blue"),
                SuggestedHabit(title="A slow morning start", icon="sunrise", color="amber"),
            ],
        ),
        "steady": SuggestedGoal(
            title="Rest on purpose",
            color="blue",
            habits=[
                SuggestedHabit(title="In bed by 11, lights out by 11:30", icon="moon", color="blue"),
                SuggestedHabit(title="No screens for the last hour", icon="sunrise", color="amber"),
            ],
        ),
        "ambitious": SuggestedGoal(
            title="Protect eight hours",
            color="blue",
            habits=[
                SuggestedHabit(title="Same bedtime and wake time, every day", icon="moon", color="blue"),
                SuggestedHabit(title="No caffeine after 2pm", icon="droplet", color="amber"),
                SuggestedHabit(title="Screens off 90 minutes before bed", icon="sunrise", color="violet"),
            ],
        ),
    },
    "connection": {
        "gentle": SuggestedGoal(
            title="Tend my people",
            color="amber",
            habits=[
                SuggestedHabit(title="Reach out to one person", icon="heart", color="amber", cadence="weekly"),
            ],
        ),
        "steady": SuggestedGoal(
            title="Tend my people",
            color="amber",
            habits=[
                SuggestedHabit(title="Message one person I care about", icon="heart", color="amber"),
                SuggestedHabit(title="One proper catch-up a week", icon="sparkles", color="sage", cadence="weekly"),
            ],
        ),
        "ambitious": SuggestedGoal(
            title="Show up for people properly",
            color="amber",
            habits=[
                SuggestedHabit(title="Message one person I care about", icon="heart", color="amber"),
                SuggestedHabit(title="Two real catch-ups a week", icon="sparkles", color="sage", cadence="weekly"),
                SuggestedHabit(title="Plan something with friends each month", icon="sunrise", color="violet", cadence="weekly"),
            ],
        ),
    },
}


def is_configured() -> bool:
    return gemini.is_configured()


def _normalize_intensity(value: str | None) -> str:
    v = (value or "").strip().lower()
    return v if v in INTENSITIES else "steady"


def _fallback(req: SuggestGoalsRequest) -> SuggestGoalsResponse:
    """Deterministic result that still honours focus, intensity and the user's
    own words — a fallback should be a smaller answer, not a different one."""
    intensity = _normalize_intensity(req.intensity)
    picks = [a.lower() for a in req.focus_areas if a.lower() in _STARTERS]
    if not picks:
        picks = ["focus", "calm"]

    goals = [_STARTERS[p][intensity].model_copy(deep=True) for p in picks[:3]]

    # If the user said what they're after, let their words title the first goal
    # rather than our generic phrasing — it should read like their plan.
    aspiration = (req.aspiration or "").strip()
    if aspiration and goals:
        goals[0].title = aspiration[:120]

    return SuggestGoalsResponse(goals=goals, source="fallback")


def _sanitize(goal: SuggestedGoal) -> SuggestedGoal:
    """Clamp any stray enum values back into the allowed palettes."""
    goal.color = goal.color if goal.color in COLORS else "sage"
    clean: list[SuggestedHabit] = []
    for h in goal.habits:
        h.color = h.color if h.color in COLORS else "sage"
        h.icon = h.icon if h.icon in ICONS else "sparkles"
        h.kind = h.kind if h.kind in KINDS else "habit"
        h.cadence = h.cadence if h.cadence in ("daily", "weekly") else "daily"
        clean.append(h)
    goal.habits = clean
    return goal


def suggest_goals(req: SuggestGoalsRequest) -> SuggestGoalsResponse:
    intensity = _normalize_intensity(req.intensity)
    lines = ["Onboarding answers:"]
    if req.focus_areas:
        lines.append(f"- Focus areas: {', '.join(req.focus_areas)}")
    # The user's own instruction leads — it is the strongest signal we have.
    if req.aspiration:
        lines.append(f"- What they asked for, in their words: {req.aspiration}")
    lines.append(f"- Intensity: {intensity} — {_INTENSITY_BRIEF[intensity]}")
    if req.constraints:
        lines.append(f"- Constraints to work around: {req.constraints}")
    if req.existing_habits:
        lines.append(f"- Already doing (don't duplicate): {', '.join(req.existing_habits)}")
    try:
        raw = gemini.generate_json(SYSTEM_PROMPT, "\n".join(lines), SUGGEST_SCHEMA, max_output_tokens=1200)
        parsed = SuggestGoalsResponse(**raw, source="llm")
        if not parsed.goals:
            return _fallback(req)
        parsed.goals = [_sanitize(g) for g in parsed.goals[:3]]
        return parsed
    except (gemini.GeminiError, httpx.HTTPError, ValidationError, ValueError, TypeError):
        return _fallback(req)
