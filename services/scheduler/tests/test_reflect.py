from fastapi.testclient import TestClient

from app.llm import gemini
from app.llm.reflect import ReflectRequest, reflect_day
from app.main import app

client = TestClient(app)

REQ = {
    "date": "2026-07-20",
    "meetings": 2,
    "showed_up_days": 8,
    "window_days": 18,
    "tasks": [
        {
            "title": "Draft investor update",
            "status": "done",
            "energy_tag": "deep",
            "estimated_minutes": 90,
            "actual_minutes": 120,
            "was_big3": True,
        },
        {"title": "Email accountant", "status": "rolled", "energy_tag": "admin"},
    ],
}


def _use_gemini(monkeypatch, raw=None, error=None):
    def fake_generate_json(system, prompt, schema, max_output_tokens=1024):
        if error:
            raise error
        return raw

    monkeypatch.setattr(gemini, "generate_json", fake_generate_json)


def test_endpoint_503_when_unconfigured(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    resp = client.post("/reflect", json=REQ)
    assert resp.status_code == 503


def test_llm_success_path(monkeypatch):
    _use_gemini(
        monkeypatch,
        raw={
            "insight": "Your Big 3 draft landed, with deep work running about a third long.",
            "pattern": "Deep work stretched past its estimate today.",
            "encouragement": "Tomorrow's plan already knows that.",
        },
    )
    out = reflect_day(ReflectRequest(**REQ))
    assert out.source == "llm"
    assert "Big 3" in out.insight


def test_llm_failure_falls_back_warm(monkeypatch):
    _use_gemini(monkeypatch, error=gemini.GeminiError("quota"))
    out = reflect_day(ReflectRequest(**REQ))
    assert out.source == "fallback"
    assert "1 thing" in out.insight and "Big 3" in out.insight
    # Tone guard: the fallback must never shame.
    for word in ("only", "just", "fail", "behind"):
        assert word not in out.insight.lower()


def test_fallback_zero_done_is_still_kind(monkeypatch):
    _use_gemini(monkeypatch, error=gemini.GeminiError("down"))
    out = reflect_day(ReflectRequest(date="2026-07-20", tasks=[]))
    assert out.source == "fallback"
    assert "re-flow" in out.insight


def test_invalid_llm_shape_falls_back(monkeypatch):
    _use_gemini(monkeypatch, raw={"insight": 42})
    out = reflect_day(ReflectRequest(**REQ))
    assert out.source == "fallback"
