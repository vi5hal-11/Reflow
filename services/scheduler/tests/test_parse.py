from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.llm import gemini
from app.llm.parse import ParseRequest, parse_capture
from app.main import app

client = TestClient(app)

REQ = {
    "text": "draft the Q3 investor update by Friday",
    "now": "2026-07-20T09:00:00+00:00",
    "timezone": "UTC",
    "existing_projects": ["Fundraising"],
}

GOOD_RAW = {
    "is_task": True,
    "title": "Draft Q3 investor update",
    "estimated_minutes": 90,
    "energy_tag": "deep",
    "deadline": "2026-07-24T17:00:00+00:00",
    "suggested_project": "Fundraising",
    "confidence": 0.82,
}


def _use_gemini(monkeypatch, raw=None, error=None):
    def fake_generate_json(system, prompt, schema, max_output_tokens=1024):
        if error:
            raise error
        return raw

    monkeypatch.setattr(gemini, "generate_json", fake_generate_json)


def test_endpoint_503_when_unconfigured(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    resp = client.post("/parse", json=REQ)
    assert resp.status_code == 503


def test_llm_success_path(monkeypatch):
    _use_gemini(monkeypatch, raw=GOOD_RAW)
    out = parse_capture(ParseRequest(**REQ))
    assert out.source == "llm"
    assert out.title == "Draft Q3 investor update"
    assert out.energy_tag == "deep"
    assert out.deadline == datetime(2026, 7, 24, 17, 0, tzinfo=timezone.utc)


def test_api_error_falls_back(monkeypatch):
    _use_gemini(monkeypatch, error=gemini.GeminiError("boom"))
    out = parse_capture(ParseRequest(**REQ))
    assert out.source == "fallback"
    assert out.is_task is True
    assert out.title == REQ["text"]
    assert out.confidence == 0.0


def test_invalid_shape_falls_back(monkeypatch):
    # Sampling-time schema should prevent this, but never trust LLM output.
    _use_gemini(monkeypatch, raw={"is_task": "yes", "confidence": 5})
    out = parse_capture(ParseRequest(**REQ))
    assert out.source == "fallback"


def test_out_of_range_estimate_falls_back(monkeypatch):
    _use_gemini(monkeypatch, raw={**GOOD_RAW, "estimated_minutes": 10_000})
    out = parse_capture(ParseRequest(**REQ))
    assert out.source == "fallback"


def test_past_deadline_is_dropped(monkeypatch):
    now = datetime(2026, 7, 20, 9, 0, tzinfo=timezone.utc)
    _use_gemini(
        monkeypatch,
        raw={**GOOD_RAW, "deadline": (now - timedelta(days=2)).isoformat()},
    )
    out = parse_capture(ParseRequest(**REQ))
    assert out.source == "llm"
    assert out.deadline is None


@pytest.mark.parametrize("bad", [{"text": ""}, {"text": "x" * 2001}])
def test_endpoint_validates_input(monkeypatch, bad):
    monkeypatch.setenv("GEMINI_API_KEY", "test")
    resp = client.post("/parse", json={**REQ, **bad})
    assert resp.status_code == 422


def test_generate_json_unconfigured_raises(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    with pytest.raises(gemini.GeminiError):
        gemini.generate_json("s", "p", {"type": "OBJECT"})
