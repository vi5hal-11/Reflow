"""Natural-language capture parsing — the LLM edge (CLAUDE.md §6).

Gemini Flash (free tier — see DECISIONS.md) with a sampling-time response
schema. Still validated with Pydantic (never trust LLM output), and any
failure falls back to a bare task so capture never breaks.
"""

from datetime import datetime

import httpx
from pydantic import BaseModel, Field, ValidationError

from ..models import EnergyTag
from . import gemini

MAX_TITLE_LEN = 200

SYSTEM_PROMPT = """You turn a user's raw capture text into a structured task suggestion for a daily planner.

Rules:
- is_task is false only when the text is clearly not actionable (a quote, a mood, a random note).
- title: a clean, short imperative phrasing of the task. Keep the user's language.
- estimated_minutes: realistic estimate; null if you can't tell. People under-estimate — round up.
- energy_tag: "deep" (focused creative/analytical work), "shallow" (light tasks, errands), "admin" (email, forms, scheduling). Null if unclear.
- deadline: only when the text names or implies a date/time; resolve relative dates ("Friday", "tomorrow 5pm") against the provided current time and timezone; ISO 8601. Null otherwise — never invent one.
- suggested_project: prefer an exact name from the provided project list; a new short name only when the text obviously names one; else null.
- confidence: 0-1, how sure you are about the overall interpretation."""

# Gemini responseSchema (OpenAPI subset). Kept by hand and mirrored by the
# Pydantic model below — Pydantic is the authority, this only constrains
# sampling.
PARSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "is_task": {"type": "BOOLEAN"},
        "title": {"type": "STRING"},
        "estimated_minutes": {"type": "INTEGER", "nullable": True},
        "energy_tag": {
            "type": "STRING",
            "enum": ["deep", "shallow", "admin"],
            "nullable": True,
        },
        "deadline": {
            "type": "STRING",
            "nullable": True,
            "description": "ISO 8601 datetime, or null",
        },
        "suggested_project": {"type": "STRING", "nullable": True},
        "confidence": {"type": "NUMBER"},
    },
    "required": ["is_task", "title", "confidence"],
}


class ParsedTask(BaseModel):
    """The §6 /parse output contract."""

    is_task: bool
    title: str
    estimated_minutes: int | None = Field(default=None, ge=1, le=8 * 60)
    energy_tag: EnergyTag | None = None
    deadline: datetime | None = None
    suggested_project: str | None = None
    confidence: float = Field(ge=0, le=1)


class ParseRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    now: datetime
    timezone: str = "UTC"
    existing_projects: list[str] = Field(default_factory=list, max_length=50)


class ParseResponse(ParsedTask):
    source: str  # "llm" | "fallback"


def is_configured() -> bool:
    return gemini.is_configured()


def _fallback(req: ParseRequest) -> ParseResponse:
    return ParseResponse(
        is_task=True,
        title=req.text.strip()[:MAX_TITLE_LEN] or "Untitled",
        confidence=0.0,
        source="fallback",
    )


def parse_capture(req: ParseRequest) -> ParseResponse:
    projects = ", ".join(req.existing_projects) or "(none)"
    prompt = (
        f"Current time: {req.now.isoformat()} ({req.timezone})\n"
        f"Existing projects: {projects}\n"
        f"Capture text:\n{req.text}"
    )
    try:
        raw = gemini.generate_json(SYSTEM_PROMPT, prompt, PARSE_SCHEMA)
        parsed = ParsedTask.model_validate(raw)
        # Semantic sanity the schema can't express: a "deadline" resolved
        # into the past is noise, not a deadline.
        if parsed.deadline is not None:
            deadline = parsed.deadline
            now = req.now
            if deadline.tzinfo is None:
                now = now.replace(tzinfo=None)
            if deadline < now:
                parsed = parsed.model_copy(update={"deadline": None})
        return ParseResponse(**parsed.model_dump(), source="llm")
    except (gemini.GeminiError, httpx.HTTPError, ValidationError, ValueError):
        return _fallback(req)
