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


def test_intensity_shapes_the_fallback():
    """The reported bug: asking for a serious training block came back as
    'walk after lunch'. Intensity must change what you get."""
    gentle = goals.suggest_goals(
        goals.SuggestGoalsRequest(focus_areas=["health"], intensity="gentle")
    )
    ambitious = goals.suggest_goals(
        goals.SuggestGoalsRequest(focus_areas=["health"], intensity="ambitious")
    )
    gentle_titles = [h.title for g in gentle.goals for h in g.habits]
    ambitious_titles = [h.title for g in ambitious.goals for h in g.habits]

    assert gentle_titles != ambitious_titles
    # The gentle stroll must not be what an ambitious ask returns.
    assert "Walk after lunch" in gentle_titles
    assert "Walk after lunch" not in ambitious_titles
    # An ambitious health ask should offer more than a token habit.
    assert len(ambitious_titles) >= 3


def test_ambitious_health_returns_real_training():
    res = goals.suggest_goals(
        goals.SuggestGoalsRequest(focus_areas=["health"], intensity="ambitious")
    )
    titles = " ".join(h.title.lower() for g in res.goals for h in g.habits)
    assert any(word in titles for word in ("strength", "run", "session"))
    assert any(h.kind == "workout" for g in res.goals for h in g.habits)


def test_aspiration_titles_the_plan():
    """The user's own words should survive the fallback, not be replaced by
    our generic phrasing."""
    res = goals.suggest_goals(
        goals.SuggestGoalsRequest(
            focus_areas=["health"],
            aspiration="Train for a half marathon",
            intensity="ambitious",
        )
    )
    assert res.goals[0].title == "Train for a half marathon"


def test_unknown_intensity_falls_back_to_steady():
    res = goals.suggest_goals(
        goals.SuggestGoalsRequest(focus_areas=["focus"], intensity="turbo")
    )
    steady = goals.suggest_goals(
        goals.SuggestGoalsRequest(focus_areas=["focus"], intensity="steady")
    )
    assert [h.title for g in res.goals for h in g.habits] == [
        h.title for g in steady.goals for h in g.habits
    ]


def test_every_focus_area_covers_every_intensity():
    """A missing (focus, intensity) pair would KeyError at runtime."""
    for area, by_intensity in goals._STARTERS.items():
        for level in goals.INTENSITIES:
            assert level in by_intensity, f"{area} is missing {level}"
            assert by_intensity[level].habits, f"{area}/{level} has no habits"


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
