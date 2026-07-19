"""Reflow scheduler service.

Owns exactly two responsibilities (CLAUDE.md §3):
- POST /schedule — deterministic re-flow (pure, fast, no LLM in the hot path)
- POST /parse, POST /reflect — LLM edges (Phase 1 / Phase 6)
"""

from fastapi import FastAPI, HTTPException

from .engine.intervals import free_intervals
from .models import ScheduleRequest, ScheduleResponse

app = FastAPI(title="Reflow Scheduler", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "scheduler"}


@app.post("/schedule", response_model=ScheduleResponse)
def schedule(req: ScheduleRequest) -> ScheduleResponse:
    """Phase 0 stub: computes free intervals to prove the pipeline; greedy
    energy-aware placement lands in Phase 3."""
    window_start = max(req.now, req.working_window_start)
    free = free_intervals(
        (window_start, req.working_window_end),
        [(b.start, b.end) for b in req.fixed_blocks],
        req.default_buffer_minutes,
    )
    # No placement yet: every flexible task is overflow until Phase 3.
    _ = free
    return ScheduleResponse(placed=[], overflow=[t.id for t in req.flexible_tasks])


@app.post("/parse")
def parse() -> None:
    raise HTTPException(status_code=501, detail="Arrives in Phase 1 (LLM capture enrichment)")


@app.post("/reflect")
def reflect() -> None:
    raise HTTPException(status_code=501, detail="Arrives in Phase 6 (end-of-day insights)")
