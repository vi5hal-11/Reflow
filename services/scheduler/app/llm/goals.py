"""Goal & habit suggestion — an LLM edge (CLAUDE.md §1: LLM at the edges only).

From a light onboarding questionnaire we ask Gemini to propose a small set of
goals, each grouping two or three tiny, specific habits. The engine never
depends on this: a deterministic fallback maps the chosen focus areas onto a
sensible starter set so onboarding always produces something.
"""

import httpx
from pydantic import BaseModel, Field, ValidationError

from . import gemini

COLORS = ["sage", "blue", "violet", "teal", "amber", "clay"]
ICONS = ["sparkles", "brain", "book", "droplet", "sunrise", "footprints", "heart", "dumbbell", "moon"]
KINDS = ["habit", "meditation", "workout"]

SYSTEM_PROMPT = f"""You design a gentle starter set of goals and habits for a calm, no-guilt planner.

The user answered a tiny onboarding questionnaire. Propose 2–3 GOALS, each grouping 2–3 small, specific, genuinely achievable habits.

Hard rules:
- Habits must be tiny and concrete ("read 10 minutes", "walk after lunch"), never vague ("be healthier").
- Prefer keystone habits the user could actually keep on a bad day.
- Never shame or imply the user is behind. Warm, plain language. No exclamation marks.
- Each goal.color and habit.color MUST be one of: {", ".join(COLORS)}.
- Each habit.icon MUST be one of: {", ".join(ICONS)}.
- Each habit.kind MUST be one of: {", ".join(KINDS)} — use "meditation" only for sitting/breathing practices, "workout" only for movement/exercise, otherwise "habit".
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


# Deterministic starter sets keyed by focus area — the fallback, and also the
# shape we want the LLM to echo.
_STARTERS: dict[str, SuggestedGoal] = {
    "health": SuggestedGoal(
        title="Feel better in my body",
        color="clay",
        habits=[
            SuggestedHabit(title="Walk after lunch", kind="workout", icon="footprints", color="clay"),
            SuggestedHabit(title="Drink a glass of water on waking", icon="droplet", color="blue"),
        ],
    ),
    "focus": SuggestedGoal(
        title="Do the work that matters",
        color="violet",
        habits=[
            SuggestedHabit(title="One deep-work block before noon", kind="habit", icon="brain", color="violet"),
            SuggestedHabit(title="Read 10 minutes", icon="book", color="teal"),
        ],
    ),
    "calm": SuggestedGoal(
        title="Carry less tension",
        color="teal",
        habits=[
            SuggestedHabit(title="Sit for 10 minutes", kind="meditation", icon="brain", color="teal"),
            SuggestedHabit(title="Wind down screen-free", icon="moon", color="violet"),
        ],
    ),
    "rest": SuggestedGoal(
        title="Rest on purpose",
        color="blue",
        habits=[
            SuggestedHabit(title="Lights out by a set time", icon="moon", color="blue"),
            SuggestedHabit(title="A slow morning start", icon="sunrise", color="amber"),
        ],
    ),
    "connection": SuggestedGoal(
        title="Tend my people",
        color="amber",
        habits=[
            SuggestedHabit(title="Reach out to one person", icon="heart", color="amber"),
        ],
    ),
}


def is_configured() -> bool:
    return gemini.is_configured()


def _fallback(req: SuggestGoalsRequest) -> SuggestGoalsResponse:
    picks = [a.lower() for a in req.focus_areas if a.lower() in _STARTERS]
    if not picks:
        picks = ["focus", "calm"]
    goals = [_STARTERS[p].model_copy(deep=True) for p in picks[:3]]
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
    lines = ["Onboarding answers:"]
    if req.focus_areas:
        lines.append(f"- Focus areas: {', '.join(req.focus_areas)}")
    if req.aspiration:
        lines.append(f"- Wants more of: {req.aspiration}")
    if req.constraints:
        lines.append(f"- Constraints: {req.constraints}")
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
