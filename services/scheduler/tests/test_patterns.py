"""Pattern analysis edge — fallback yields calm, non-empty observations."""

from app.llm import patterns


def test_fallback_reports_steadiest_and_mood():
    req = patterns.PatternsRequest(
        mood_series=[3, 4, None, 5, 2],
        habits=[
            patterns.HabitStat(title="Read", days_active=9),
            patterns.HabitStat(title="Walk", days_active=3),
        ],
        journal_days=4,
        meditation_minutes=40,
        workout_minutes=60,
    )
    res = patterns.analyze_patterns(req)  # no key -> fallback
    assert res.source == "fallback"
    assert res.observations
    assert "Read" in res.observations[0]  # steadiest habit surfaced first
    assert res.reflect_prompt


def test_fallback_thin_data_still_speaks():
    res = patterns.analyze_patterns(patterns.PatternsRequest())
    assert res.source == "fallback"
    assert len(res.observations) >= 1


def test_no_shame_words_in_fallback():
    res = patterns.analyze_patterns(
        patterns.PatternsRequest(habits=[patterns.HabitStat(title="Sit", days_active=1)])
    )
    joined = " ".join(res.observations + [res.reflect_prompt]).lower()
    for word in ("fail", "lazy", "behind", "only ", "should"):
        assert word not in joined
