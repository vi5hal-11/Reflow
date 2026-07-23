"""Goal suggestion edge — fallback always yields a usable, sanitized set."""

from app.llm import goals


def test_fallback_maps_focus_areas():
    req = goals.SuggestGoalsRequest(focus_areas=["health", "calm"])
    res = goals.suggest_goals(req)  # no GEMINI_API_KEY in tests -> fallback
    assert res.source == "fallback"
    assert 1 <= len(res.goals) <= 3
    assert all(g.habits for g in res.goals)


def test_fallback_defaults_when_no_focus():
    res = goals.suggest_goals(goals.SuggestGoalsRequest())
    assert res.source == "fallback"
    assert len(res.goals) >= 1


def test_sanitize_clamps_stray_enums():
    dirty = goals.SuggestedGoal(
        title="x",
        color="neon",  # not in palette
        habits=[goals.SuggestedHabit(title="y", kind="sprint", icon="rocket", color="fuchsia", cadence="hourly")],
    )
    clean = goals._sanitize(dirty)
    assert clean.color == "sage"
    h = clean.habits[0]
    assert h.color == "sage"
    assert h.icon == "sparkles"
    assert h.kind == "habit"
    assert h.cadence == "daily"
