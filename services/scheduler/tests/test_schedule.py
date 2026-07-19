"""The scheduler is the heart of the product — test it hard (CLAUDE.md §10).

Properties enforced: no overlaps (buffers respected), fixed blocks never
moved, placed+overflow partition the task set, determinism, stability
round-trip, window containment. Plus the nasty cases: overbooked day,
back-to-back meetings, a task larger than any gap, midday re-flow.
"""

import time
from datetime import datetime, timedelta, timezone

from hypothesis import given, settings
from hypothesis import strategies as st

from app.engine.schedule import plan
from app.models import (
    EnergyWindow,
    FixedBlock,
    FlexibleTask,
    ScheduleRequest,
)

DAY = datetime(2026, 7, 20, tzinfo=timezone.utc)


def at(hour: int, minute: int = 0) -> datetime:
    return DAY + timedelta(hours=hour, minutes=minute)


def task(id: str, minutes: int = 30, **kw) -> FlexibleTask:
    return FlexibleTask(id=id, title=id, estimated_minutes=minutes, **kw)


def request(**kw) -> ScheduleRequest:
    defaults = dict(
        now=at(9),
        working_window_start=at(9),
        working_window_end=at(18),
        default_buffer_minutes=10,
        wildcard_count=1,
        wildcard_minutes=30,
    )
    defaults.update(kw)
    return ScheduleRequest(**defaults)


def assert_invariants(req: ScheduleRequest, res) -> None:
    window_start = max(req.now, req.working_window_start)
    buffer = timedelta(minutes=req.default_buffer_minutes)

    # placed + overflow exactly partition the flexible tasks
    placed_ids = [p.task_id for p in res.placed]
    assert len(placed_ids) == len(set(placed_ids)), "task placed twice"
    assert set(placed_ids) | set(res.overflow) == {t.id for t in req.flexible_tasks}
    assert set(placed_ids) & set(res.overflow) == set()

    # window containment: fresh placements inside the clamped window; kept
    # blocks may have started earlier (in progress) but must end inside it
    for p in res.placed:
        assert p.end <= req.working_window_end
        assert p.start < p.end
        if not p.kept:
            assert p.start >= window_start

    # no overlaps, buffers respected, between every pair of blocks
    blocks = (
        [(max(p.start, window_start), p.end, f"task {p.task_id}") for p in res.placed]
        + [(b.start, b.end, f"fixed {b.id}") for b in req.fixed_blocks]
        + [(w.start, w.end, "wildcard") for w in res.wildcards]
    )
    for i, (s1, e1, l1) in enumerate(blocks):
        for s2, e2, l2 in blocks[i + 1 :]:
            fixed_pair = l1.startswith("fixed") and l2.startswith("fixed")
            if fixed_pair:
                continue  # external calendar conflicts are the caller's reality
            gap_ok = s1 >= e2 + buffer or s2 >= e1 + buffer
            assert gap_ok, f"{l1} [{s1}-{e1}] within buffer of {l2} [{s2}-{e2}]"


def test_empty_request_places_nothing():
    res = plan(request())
    assert res.placed == [] and res.overflow == []


def test_simple_placement_respects_buffer():
    req = request(
        fixed_blocks=[FixedBlock(id="m", title="meeting", start=at(10), end=at(11))],
        flexible_tasks=[task("a", 60), task("b", 30)],
    )
    res = plan(req)
    assert set(p.task_id for p in res.placed) == {"a", "b"}
    assert_invariants(req, res)


def test_fixed_blocks_never_moved():
    fixed = [FixedBlock(id="m", title="m", start=at(10), end=at(12))]
    req = request(fixed_blocks=fixed, flexible_tasks=[task("a", 240)])
    plan(req)
    assert fixed[0].start == at(10) and fixed[0].end == at(12)


def test_big3_wins_contested_capacity():
    # Only one 60m slot fits a 60m task; big3 must get it despite worse
    # priority and later creation.
    req = request(
        working_window_end=at(10, 30),
        wildcard_count=0,
        flexible_tasks=[
            task("filler", 60, priority=1, created_at=at(0)),
            task("big", 60, is_big3=True, priority=3, created_at=at(1)),
        ],
    )
    res = plan(req)
    placed = {p.task_id for p in res.placed}
    assert "big" in placed
    assert res.overflow == ["filler"]


def test_big3_outranks_wildcard_reservation():
    # Window fits exactly one 30m block: the Big 3 task, not the wildcard.
    req = request(
        working_window_end=at(9, 30),
        wildcard_count=2,
        flexible_tasks=[task("big", 30, is_big3=True)],
    )
    res = plan(req)
    assert [p.task_id for p in res.placed] == ["big"]
    assert res.wildcards == []


def test_deadline_urgency_beats_priority():
    req = request(
        working_window_end=at(10),
        wildcard_count=0,
        flexible_tasks=[
            task("low_pri_urgent", 50, priority=3, deadline=at(11)),
            task("high_pri_lax", 50, priority=1, deadline=at(23)),
        ],
    )
    res = plan(req)
    assert {p.task_id for p in res.placed} == {"low_pri_urgent"}


def test_task_larger_than_any_gap_overflows():
    req = request(
        fixed_blocks=[FixedBlock(id="m", title="m", start=at(12), end=at(13))],
        flexible_tasks=[task("whale", 6 * 60)],
        wildcard_count=0,
    )
    res = plan(req)
    assert res.overflow == ["whale"]


def test_overbooked_day_overflows_not_errors():
    req = request(
        flexible_tasks=[task(f"t{i}", 120) for i in range(10)],
    )
    res = plan(req)
    assert_invariants(req, res)
    assert len(res.overflow) > 0


def test_energy_matching_prefers_matching_window():
    req = request(
        energy_windows=[EnergyWindow(tag="deep", start=at(14), end=at(16))],
        flexible_tasks=[task("focus", 60, energy_tag="deep")],
        wildcard_count=0,
    )
    res = plan(req)
    assert res.placed[0].start == at(14)


def test_energy_window_anchors_start_even_when_task_spills_past_it():
    # Starting inside the energy window matters more than fitting inside it:
    # a long deep task begins in deep hours and spills, by design.
    req = request(
        energy_windows=[EnergyWindow(tag="deep", start=at(14), end=at(14, 30))],
        flexible_tasks=[task("focus", 60, energy_tag="deep")],
        wildcard_count=0,
    )
    res = plan(req)
    assert res.placed[0].start == at(14)


def test_energy_fallback_when_no_room_near_window():
    # The energy window region is fully occupied → earliest fit wins.
    req = request(
        energy_windows=[EnergyWindow(tag="deep", start=at(14), end=at(15))],
        fixed_blocks=[FixedBlock(id="m", title="m", start=at(13, 30), end=at(18))],
        flexible_tasks=[task("focus", 60, energy_tag="deep")],
        wildcard_count=0,
    )
    res = plan(req)
    assert res.placed[0].start == at(9)


def test_midday_reflow_keeps_valid_and_reschedules_overrun():
    # It's 13:00. One block is untouched in the future (keep), one was
    # missed entirely this morning (reschedule), one is in progress (keep).
    req = request(
        now=at(13),
        flexible_tasks=[
            task("future", 60, scheduled_start=at(15), scheduled_end=at(16)),
            task("missed", 30, scheduled_start=at(10), scheduled_end=at(10, 30)),
            task("in_progress", 60, scheduled_start=at(12, 30), scheduled_end=at(13, 30)),
        ],
    )
    res = plan(req)
    by_id = {p.task_id: p for p in res.placed}
    assert by_id["future"].kept and by_id["future"].start == at(15)
    assert by_id["in_progress"].kept and by_id["in_progress"].start == at(12, 30)
    assert not by_id["missed"].kept
    assert by_id["missed"].start >= at(13)
    assert_invariants(req, res)


def test_kept_placement_yields_to_new_fixed_block():
    # A meeting landed on top of an existing placement: the placement moves.
    req = request(
        fixed_blocks=[FixedBlock(id="m", title="m", start=at(10), end=at(11))],
        flexible_tasks=[task("t", 30, scheduled_start=at(10), scheduled_end=at(10, 30))],
    )
    res = plan(req)
    assert len(res.placed) == 1
    assert not res.placed[0].kept
    assert_invariants(req, res)


def test_window_in_past_overflows_everything():
    req = request(now=at(20), flexible_tasks=[task("a"), task("b")])
    res = plan(req)
    assert res.placed == [] and set(res.overflow) == {"a", "b"}


def test_wildcard_reserved_at_end_of_day():
    req = request(flexible_tasks=[task("a", 60)])
    res = plan(req)
    assert len(res.wildcards) == 1
    assert res.wildcards[0].end == at(18)


def test_back_to_back_meetings():
    req = request(
        fixed_blocks=[
            FixedBlock(id=f"m{h}", title="m", start=at(h), end=at(h + 1))
            for h in (10, 11, 12, 13)
        ],
        flexible_tasks=[task("a", 45)],
        wildcard_count=0,
    )
    res = plan(req)
    assert_invariants(req, res)
    assert {p.task_id for p in res.placed} == {"a"}


# --- property tests ---------------------------------------------------------

aware_minutes = st.integers(min_value=0, max_value=14 * 60)


@st.composite
def schedule_requests(draw):
    n_tasks = draw(st.integers(0, 12))
    n_fixed = draw(st.integers(0, 4))
    now = at(8) + timedelta(minutes=draw(st.integers(0, 10 * 60)))
    tasks = []
    for i in range(n_tasks):
        scheduled = draw(st.booleans())
        s = at(8) + timedelta(minutes=draw(aware_minutes)) if scheduled else None
        dur = draw(st.integers(10, 180))
        tasks.append(
            FlexibleTask(
                id=f"t{i}",
                title=f"t{i}",
                estimated_minutes=dur,
                energy_tag=draw(st.sampled_from(["deep", "shallow", "admin", None])),
                priority=draw(st.integers(1, 3)),
                deadline=at(draw(st.integers(9, 23))) if draw(st.booleans()) else None,
                is_big3=draw(st.booleans()),
                scheduled_start=s,
                scheduled_end=s + timedelta(minutes=dur) if s else None,
                created_at=at(0) + timedelta(minutes=i),
            )
        )
    fixed = []
    for i in range(n_fixed):
        s = at(9) + timedelta(minutes=draw(aware_minutes))
        fixed.append(
            FixedBlock(
                id=f"f{i}", title=f"f{i}", start=s,
                end=s + timedelta(minutes=draw(st.integers(15, 120))),
            )
        )
    return request(
        now=now,
        fixed_blocks=fixed,
        flexible_tasks=tasks,
        default_buffer_minutes=draw(st.sampled_from([0, 5, 10])),
        wildcard_count=draw(st.integers(0, 2)),
        energy_windows=[
            EnergyWindow(tag="deep", start=at(9), end=at(12)),
            EnergyWindow(tag="admin", start=at(14), end=at(16)),
        ],
    )


@given(schedule_requests())
@settings(max_examples=200, deadline=None)
def test_property_invariants(req):
    assert_invariants(req, plan(req))


@given(schedule_requests())
@settings(max_examples=50, deadline=None)
def test_property_deterministic(req):
    a, b = plan(req), plan(req)
    assert a == b


@given(schedule_requests())
@settings(max_examples=50, deadline=None)
def test_property_stability_round_trip(req):
    """Feeding a plan's own placements back in re-flows to the same plan."""
    first = plan(req)
    placed = {p.task_id: p for p in first.placed}
    replayed = req.model_copy(
        update={
            "flexible_tasks": [
                t.model_copy(
                    update={
                        "scheduled_start": placed[t.id].start if t.id in placed else None,
                        "scheduled_end": placed[t.id].end if t.id in placed else None,
                    }
                )
                for t in req.flexible_tasks
            ]
        }
    )
    second = plan(replayed)
    for p in second.placed:
        if p.task_id in placed:
            prev = placed[p.task_id]
            assert p.kept, f"previously placed {p.task_id} was moved"
            assert (p.start, p.end) == (prev.start, prev.end)


def test_perf_50_tasks_under_target():
    """Product target is <50ms (§5); assert 200ms to keep CI unflaky."""
    req = request(
        fixed_blocks=[
            FixedBlock(id=f"f{i}", title="m", start=at(9 + i), end=at(9 + i, 30))
            for i in range(8)
        ],
        flexible_tasks=[
            task(f"t{i}", 20 + (i % 5) * 10, is_big3=i < 3,
                 energy_tag=["deep", "shallow", "admin"][i % 3])
            for i in range(50)
        ],
        energy_windows=[EnergyWindow(tag="deep", start=at(9), end=at(12))],
    )
    plan(req)  # warm
    t0 = time.perf_counter()
    plan(req)
    elapsed_ms = (time.perf_counter() - t0) * 1000
    assert elapsed_ms < 200, f"re-flow took {elapsed_ms:.1f}ms"
