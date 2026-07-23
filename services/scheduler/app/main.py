"""Reflow scheduler service.

Owns exactly two responsibilities (CLAUDE.md §3):
- POST /schedule — deterministic re-flow (pure, fast, no LLM in the hot path)
- POST /parse, POST /reflect — LLM edges (Phase 1 / Phase 6)
"""

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException

# Local-dev convenience: pick up services/scheduler/.env (copy .env.example).
# Real environment variables always win; deployed platforms set them directly.
load_dotenv()

from .engine.schedule import plan
from .llm import goals as llm_goals
from .llm import parse as llm_parse
from .llm import patterns as llm_patterns
from .llm import reflect as llm_reflect
from .models import ScheduleRequest, ScheduleResponse

app = FastAPI(title="Reflow Scheduler", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "scheduler"}


@app.post("/schedule", response_model=ScheduleResponse)
def schedule(req: ScheduleRequest) -> ScheduleResponse:
    """Deterministic re-flow (CLAUDE.md §5): pure, fast, no LLM in the hot
    path. Overflow is an outcome, not an error."""
    return plan(req)


@app.post("/parse", response_model=llm_parse.ParseResponse)
def parse(req: llm_parse.ParseRequest) -> llm_parse.ParseResponse:
    """Enrich a raw capture into a structured task suggestion. Never blocks
    capture: callers treat 503 (unconfigured) and `source: "fallback"` as
    "keep the raw text"."""
    if not llm_parse.is_configured():
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY not configured")
    return llm_parse.parse_capture(req)


@app.post("/reflect", response_model=llm_reflect.ReflectResponse)
def reflect(req: llm_reflect.ReflectRequest) -> llm_reflect.ReflectResponse:
    """End-of-day insight (§9 Phase 6). Calm by contract; falls back to a
    warm deterministic summary when the LLM misbehaves."""
    if not llm_reflect.is_configured():
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY not configured")
    return llm_reflect.reflect_day(req)


@app.post("/suggest-goals", response_model=llm_goals.SuggestGoalsResponse)
def suggest_goals(req: llm_goals.SuggestGoalsRequest) -> llm_goals.SuggestGoalsResponse:
    """Onboarding: propose goals grouping tiny habits. Always returns a usable
    set — falls back to a deterministic starter map when the LLM is unreachable."""
    return llm_goals.suggest_goals(req)


@app.post("/patterns", response_model=llm_patterns.PatternsResponse)
def patterns(req: llm_patterns.PatternsRequest) -> llm_patterns.PatternsResponse:
    """Gentle, data-backed observations over the last fortnight. Calm by
    contract; deterministic fallback so insights never error at the user."""
    return llm_patterns.analyze_patterns(req)
