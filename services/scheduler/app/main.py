"""Reflow scheduler service.

Owns exactly two responsibilities (CLAUDE.md §3):
- POST /schedule — deterministic re-flow (pure, fast, no LLM in the hot path)
- POST /parse, POST /reflect — LLM edges (Phase 1 / Phase 6)
"""

from fastapi import FastAPI, HTTPException

from .engine.schedule import plan
from .llm import parse as llm_parse
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
