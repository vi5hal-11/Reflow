"""End-of-day reflection — the second LLM edge (CLAUDE.md §9 Phase 6).

Tone rules are product rules (§7): calm, specific, zero guilt. When the LLM
is unreachable the fallback still produces a warm, honest summary from the
numbers alone — reflection never errors at the user.
"""

import httpx
from pydantic import BaseModel, Field, ValidationError

from ..models import EnergyTag
from . import gemini

SYSTEM_PROMPT = """You write a tiny end-of-day reflection for a daily planner whose brand is forgiveness.

Hard tone rules:
- Never shame, never mention failure, laziness, or being behind. No "only", no "just", no "unfortunately".
- Celebrate what landed first. Rolled-forward tasks are normal life, not debt.
- insight: ONE sentence, specific to today's data (what got done, where time actually went).
- pattern: ONE gentle, data-backed observation across the day (e.g. deep work landing in the morning, estimates running long on admin) — or null if the data is too thin. Phrase it as something interesting, not a correction.
- encouragement: ONE short warm sentence looking at tomorrow. Calm, not cheerleading. No exclamation marks."""

REFLECT_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "insight": {"type": "STRING"},
        "pattern": {"type": "STRING", "nullable": True},
        "encouragement": {"type": "STRING"},
    },
    "required": ["insight", "encouragement"],
}


class ReflectTask(BaseModel):
    title: str = Field(max_length=200)
    status: str  # done | scheduled | todo | rolled
    energy_tag: EnergyTag | None = None
    estimated_minutes: int | None = None
    actual_minutes: int | None = None
    was_big3: bool = False


class ReflectRequest(BaseModel):
    date: str  # YYYY-MM-DD, the day being reflected on
    tasks: list[ReflectTask] = Field(default_factory=list, max_length=100)
    meetings: int = Field(default=0, ge=0)
    showed_up_days: int | None = None
    window_days: int | None = None


class Reflection(BaseModel):
    insight: str = Field(max_length=500)
    pattern: str | None = Field(default=None, max_length=500)
    encouragement: str = Field(max_length=500)


class ReflectResponse(Reflection):
    source: str  # "llm" | "fallback"


def is_configured() -> bool:
    return gemini.is_configured()


def _fallback(req: ReflectRequest) -> ReflectResponse:
    done = sum(1 for t in req.tasks if t.status == "done")
    big3_done = sum(1 for t in req.tasks if t.was_big3 and t.status == "done")
    if done == 0:
        insight = "Today didn't go to plan — that's what tomorrow's re-flow is for."
    elif big3_done > 0:
        insight = f"You finished {done} thing{'s' if done != 1 else ''} today, including {big3_done} of your Big 3."
    else:
        insight = f"You finished {done} thing{'s' if done != 1 else ''} today."
    return ReflectResponse(
        insight=insight,
        pattern=None,
        encouragement="Whatever rolled forward will be waiting, without the pile-up.",
        source="fallback",
    )


def reflect_day(req: ReflectRequest) -> ReflectResponse:
    lines = [f"Date: {req.date}", f"Fixed meetings/events today: {req.meetings}"]
    if req.showed_up_days is not None and req.window_days:
        lines.append(
            f"Momentum: showed up {req.showed_up_days} of the last {req.window_days} days"
        )
    lines.append("Tasks (status | energy | estimated -> actual minutes | big3):")
    for t in req.tasks:
        lines.append(
            f"- {t.title} | {t.status} | {t.energy_tag or '-'} | "
            f"{t.estimated_minutes or '?'} -> {t.actual_minutes or '?'} | "
            f"{'BIG3' if t.was_big3 else '-'}"
        )
    try:
        raw = gemini.generate_json(SYSTEM_PROMPT, "\n".join(lines), REFLECT_SCHEMA)
        reflection = Reflection.model_validate(raw)
        return ReflectResponse(**reflection.model_dump(), source="llm")
    except (gemini.GeminiError, httpx.HTTPError, ValidationError, ValueError):
        return _fallback(req)
