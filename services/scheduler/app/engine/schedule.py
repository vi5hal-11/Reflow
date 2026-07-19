"""Deterministic, greedy, energy-aware placement (CLAUDE.md §5).

Pure function: no I/O, no clock reads, no randomness. Given identical
inputs, identical output. `req.now` is the only notion of time.

Placement order:
1. Clamp the window to `now` — a re-flow only touches remaining time.
2. Stability: keep every existing placement that is still valid (inside the
   remaining window — or in progress right now — and conflict-free). Only
   move what must move; a block the user is committed to is not reshuffled.
3. Rank the rest: Big 3 first, then deadline urgency, then priority, then
   FIFO by created_at, then id (final deterministic tiebreak).
4. Place Big 3, then reserve wildcard breathing room at the end of the day
   (white space is a feature; Big 3 outrank wildcards, wildcards outrank
   everything else), then place the remaining tasks.
5. Whatever fits nowhere goes to `overflow` — an outcome, not an error.
"""

from datetime import datetime, timedelta

from ..models import (
    FlexibleTask,
    PlacedBlock,
    ScheduleRequest,
    ScheduleResponse,
    WildcardBlock,
)
from .intervals import Interval, free_intervals


def _rank_key(task: FlexibleTask, window: Interval):
    window_start, window_end = window
    return (
        not task.is_big3,
        task.deadline is None,
        task.deadline or window_end,
        task.priority,
        task.created_at is None,
        task.created_at or window_start,
        task.id,
    )


def _conflicts(candidate: Interval, busy: list[Interval], buffer: timedelta) -> bool:
    start, end = candidate
    return any(start < b_end + buffer and end > b_start - buffer for b_start, b_end in busy)


def _best_fit(
    task: FlexibleTask,
    free: list[Interval],
    energy_windows: list[Interval],
) -> Interval | None:
    """Earliest energy-matched start if any, else earliest start that fits."""
    duration = timedelta(minutes=task.estimated_minutes)
    fallback: Interval | None = None
    best_energy: Interval | None = None
    for f_start, f_end in free:
        if f_end - f_start < duration:
            continue
        if fallback is None:
            fallback = (f_start, f_start + duration)
        for e_start, e_end in energy_windows:
            start = max(f_start, e_start)
            if start + duration <= f_end and start < e_end:
                candidate = (start, start + duration)
                if best_energy is None or candidate[0] < best_energy[0]:
                    best_energy = candidate
    return best_energy or fallback


def plan(req: ScheduleRequest) -> ScheduleResponse:
    window_start = max(req.now, req.working_window_start)
    window_end = req.working_window_end
    all_ids = [t.id for t in req.flexible_tasks]
    if window_start >= window_end:
        return ScheduleResponse(placed=[], wildcards=[], overflow=all_ids)

    buffer = timedelta(minutes=req.default_buffer_minutes)
    window: Interval = (window_start, window_end)
    busy: list[Interval] = [(b.start, b.end) for b in req.fixed_blocks]

    # --- 2. stability: keep still-valid placements verbatim -----------------
    kept: list[PlacedBlock] = []
    candidates = sorted(
        (t for t in req.flexible_tasks if t.scheduled_start and t.scheduled_end),
        key=lambda t: (t.scheduled_start, t.id),
    )
    for task in candidates:
        start, end = task.scheduled_start, task.scheduled_end
        assert start is not None and end is not None
        in_progress = start < window_start < end
        valid_span = (
            start >= req.working_window_start and end <= window_end and start < end
        )
        if not valid_span or (start < window_start and not in_progress):
            continue
        occupied = (max(start, window_start), end)
        if _conflicts(occupied, busy, buffer):
            continue
        kept.append(PlacedBlock(task_id=task.id, start=start, end=end, kept=True))
        busy.append(occupied)

    kept_ids = {p.task_id for p in kept}
    pending = sorted(
        (t for t in req.flexible_tasks if t.id not in kept_ids),
        key=lambda t: _rank_key(t, window),
    )

    def energy_for(task: FlexibleTask) -> list[Interval]:
        if task.energy_tag is None:
            return []
        return sorted(
            (w.start, w.end) for w in req.energy_windows if w.tag == task.energy_tag
        )

    placed: list[PlacedBlock] = []
    overflow: list[str] = []

    def try_place(task: FlexibleTask) -> bool:
        free = free_intervals(window, busy, req.default_buffer_minutes)
        slot = _best_fit(task, free, energy_for(task))
        if slot is None:
            return False
        placed.append(PlacedBlock(task_id=task.id, start=slot[0], end=slot[1], kept=False))
        busy.append(slot)
        return True

    # --- 4a. Big 3 outrank everything, including wildcards ------------------
    big3 = [t for t in pending if t.is_big3]
    rest = [t for t in pending if not t.is_big3]
    for task in big3:
        if not try_place(task):
            overflow.append(task.id)

    # --- 4b. reserve wildcard breathing room at the end of the day ----------
    wildcards: list[WildcardBlock] = []
    wc_duration = timedelta(minutes=req.wildcard_minutes)
    for _ in range(req.wildcard_count):
        free = free_intervals(window, busy, req.default_buffer_minutes)
        slot = next(
            ((f_end - wc_duration, f_end) for f_start, f_end in reversed(free)
             if f_end - f_start >= wc_duration),
            None,
        )
        if slot is None:
            break
        wildcards.append(WildcardBlock(start=slot[0], end=slot[1]))
        busy.append(slot)

    # --- 4c. everything else -------------------------------------------------
    for task in rest:
        if not try_place(task):
            overflow.append(task.id)

    ordered = sorted(kept + placed, key=lambda p: (p.start, p.task_id))
    return ScheduleResponse(placed=ordered, wildcards=wildcards, overflow=overflow)
