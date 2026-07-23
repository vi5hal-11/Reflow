"""Wellness pattern analysis — an LLM edge (CLAUDE.md §1).

Given a compact, already-aggregated summary of the user's last couple of weeks
(mood series, per-habit consistency, journaling cadence, minutes moved/sat), we
ask Gemini for two or three gentle, data-backed observations plus one kind
"reflect on why" prompt. Deterministic fallback so insights never error out.
"""

import httpx
from pydantic import BaseModel, Field, ValidationError

from . import gemini

SYSTEM_PROMPT = """You surface gentle patterns from a person's last two weeks in a calm, no-guilt wellness planner.

You are given aggregated numbers only. Return:
- observations: 2–3 SHORT, specific, data-backed noticings (e.g. "Your mood tends to lift on days you moved", "Reading has been your steadiest habit"). Frame as something interesting, never a correction or a failure.
- reflect_prompt: ONE warm, open question inviting the user to reflect on WHY a dip or a skip happened — curious, never accusatory (e.g. "On the quieter days, what tended to get in the way?").

Hard tone rules: never shame, never "only"/"just"/"should", no exclamation marks. If the data is thin, say something encouraging about starting, and keep observations to one."""

PATTERNS_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "observations": {"type": "ARRAY", "items": {"type": "STRING"}},
        "reflect_prompt": {"type": "STRING"},
    },
    "required": ["observations", "reflect_prompt"],
}


class HabitStat(BaseModel):
    title: str = Field(max_length=120)
    kind: str = "habit"
    days_active: int = 0
    window_days: int = 14


class PatternsRequest(BaseModel):
    mood_series: list[int | None] = Field(default_factory=list, max_length=31)
    habits: list[HabitStat] = Field(default_factory=list, max_length=50)
    journal_days: int = 0
    meditation_minutes: int = 0
    workout_minutes: int = 0
    window_days: int = 14


class PatternsResult(BaseModel):
    observations: list[str] = Field(default_factory=list, max_length=4)
    reflect_prompt: str = Field(max_length=300)


class PatternsResponse(PatternsResult):
    source: str  # "llm" | "fallback"


def is_configured() -> bool:
    return gemini.is_configured()


def _fallback(req: PatternsRequest) -> PatternsResponse:
    obs: list[str] = []
    moods = [m for m in req.mood_series if m is not None]
    if req.habits:
        steadiest = max(req.habits, key=lambda h: h.days_active)
        if steadiest.days_active > 0:
            obs.append(
                f"{steadiest.title} has been your steadiest — {steadiest.days_active} of the last {steadiest.window_days} days."
            )
    if moods:
        avg = sum(moods) / len(moods)
        mood_word = "bright" if avg >= 4 else "even" if avg >= 3 else "heavy"
        obs.append(f"Your mood has run mostly {mood_word} across {len(moods)} check-ins.")
    if req.meditation_minutes or req.workout_minutes:
        obs.append(
            f"You gave yourself {req.meditation_minutes + req.workout_minutes} minutes to move or sit this fortnight."
        )
    if not obs:
        obs.append("This is the very start — the picture fills in as you check in.")
    return PatternsResponse(
        observations=obs[:3],
        reflect_prompt="On the quieter days, what tended to get in the way — and what would make showing up a little easier?",
        source="fallback",
    )


def analyze_patterns(req: PatternsRequest) -> PatternsResponse:
    lines = [f"Window: last {req.window_days} days"]
    moods = [str(m) if m is not None else "-" for m in req.mood_series]
    lines.append(f"Mood (1 low..5 high, - = no check-in): {' '.join(moods)}")
    lines.append(f"Journaled on {req.journal_days} days")
    lines.append(f"Meditation minutes: {req.meditation_minutes}; Workout minutes: {req.workout_minutes}")
    lines.append("Habit consistency:")
    for h in req.habits:
        lines.append(f"- {h.title} ({h.kind}): {h.days_active}/{h.window_days} days")
    try:
        raw = gemini.generate_json(SYSTEM_PROMPT, "\n".join(lines), PATTERNS_SCHEMA, max_output_tokens=600)
        result = PatternsResult.model_validate(raw)
        if not result.observations:
            return _fallback(req)
        return PatternsResponse(**result.model_dump(), source="llm")
    except (gemini.GeminiError, httpx.HTTPError, ValidationError, ValueError):
        return _fallback(req)
