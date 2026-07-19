from datetime import datetime, timedelta

from app.engine.intervals import free_intervals, merge_overlapping


def t(hour: int, minute: int = 0) -> datetime:
    return datetime(2026, 7, 20, hour, minute)


class TestMergeOverlapping:
    def test_empty(self):
        assert merge_overlapping([]) == []

    def test_disjoint_stay_disjoint(self):
        intervals = [(t(9), t(10)), (t(11), t(12))]
        assert merge_overlapping(intervals) == intervals

    def test_overlapping_merge(self):
        assert merge_overlapping([(t(9), t(11)), (t(10), t(12))]) == [(t(9), t(12))]

    def test_touching_merge(self):
        assert merge_overlapping([(t(9), t(10)), (t(10), t(11))]) == [(t(9), t(11))]

    def test_unsorted_input(self):
        assert merge_overlapping([(t(11), t(12)), (t(9), t(10))]) == [
            (t(9), t(10)),
            (t(11), t(12)),
        ]


class TestFreeIntervals:
    def test_empty_day_is_fully_free(self):
        assert free_intervals((t(9), t(18)), []) == [(t(9), t(18))]

    def test_single_meeting_splits_day(self):
        assert free_intervals((t(9), t(18)), [(t(12), t(13))]) == [
            (t(9), t(12)),
            (t(13), t(18)),
        ]

    def test_buffer_pads_both_sides(self):
        result = free_intervals((t(9), t(18)), [(t(12), t(13))], buffer_minutes=15)
        assert result == [(t(9), t(11, 45)), (t(13, 15), t(18))]

    def test_back_to_back_meetings_merge(self):
        result = free_intervals((t(9), t(18)), [(t(10), t(11)), (t(11), t(12))])
        assert result == [(t(9), t(10)), (t(12), t(18))]

    def test_meeting_outside_window_ignored(self):
        assert free_intervals((t(9), t(18)), [(t(19), t(20))]) == [(t(9), t(18))]

    def test_meeting_spanning_window_start(self):
        assert free_intervals((t(9), t(18)), [(t(8), t(10))]) == [(t(10), t(18))]

    def test_fully_booked_day(self):
        assert free_intervals((t(9), t(18)), [(t(8), t(19))]) == []

    def test_empty_window(self):
        assert free_intervals((t(18), t(9)), []) == []

    def test_no_overlap_in_output(self):
        busy = [(t(9, 30), t(10)), (t(9, 45), t(11)), (t(14), t(15))]
        free = free_intervals((t(9), t(18)), busy, buffer_minutes=5)
        for (s1, e1), (s2, e2) in zip(free, free[1:]):
            assert e1 <= s2
        for fs, fe in free:
            for bs, be in busy:
                pad = timedelta(minutes=5)
                assert fe <= bs - pad or fs >= be + pad
