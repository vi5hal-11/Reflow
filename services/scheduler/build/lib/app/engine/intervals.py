"""Pure interval math for the deterministic scheduler.

Everything here is side-effect free: given identical inputs, identical
output. The full greedy placement algorithm lands in Phase 3; free-interval
computation is its foundation and ships (tested) from Phase 0.
"""

from datetime import datetime, timedelta

Interval = tuple[datetime, datetime]


def merge_overlapping(intervals: list[Interval]) -> list[Interval]:
    """Merge overlapping/touching intervals into a sorted, disjoint list."""
    if not intervals:
        return []
    ordered = sorted(intervals)
    merged = [ordered[0]]
    for start, end in ordered[1:]:
        last_start, last_end = merged[-1]
        if start <= last_end:
            merged[-1] = (last_start, max(last_end, end))
        else:
            merged.append((start, end))
    return merged


def free_intervals(
    window: Interval,
    busy: list[Interval],
    buffer_minutes: int = 0,
) -> list[Interval]:
    """Subtract busy blocks (padded by a buffer on both sides) from a window.

    Returns disjoint free intervals in ascending order. Intervals of zero or
    negative length are dropped.
    """
    window_start, window_end = window
    if window_start >= window_end:
        return []

    pad = timedelta(minutes=buffer_minutes)
    padded = [(start - pad, end + pad) for start, end in busy]
    blocked = merge_overlapping(padded)

    free: list[Interval] = []
    cursor = window_start
    for start, end in blocked:
        if end <= window_start or start >= window_end:
            continue
        if start > cursor:
            free.append((cursor, min(start, window_end)))
        cursor = max(cursor, end)
    if cursor < window_end:
        free.append((cursor, window_end))
    return [(s, e) for s, e in free if e > s]
