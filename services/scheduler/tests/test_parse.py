from datetime import datetime, timedelta, timezone

import anthropic
import pytest
from fastapi.testclient import TestClient

from app.llm import parse as llm_parse
from app.llm.parse import ParsedTask, ParseRequest, parse_capture
from app.main import app

client = TestClient(app)

REQ = {
    "text": "draft the Q3 investor update by Friday",
    "now": "2026-07-20T09:00:00+00:00",
    "timezone": "UTC",
    "existing_projects": ["Fundraising"],
}


class FakeResult:
    def __init__(self, parsed):
        self.parsed_output = parsed


class FakeMessages:
    def __init__(self, result=None, error=None):
        self._result = result
        self._error = error

    def parse(self, **kwargs):
        if self._error:
            raise self._error
        return self._result


class FakeClient:
    def __init__(self, result=None, error=None):
        self.messages = FakeMessages(result, error)


def _use_client(monkeypatch, fake):
    monkeypatch.setattr(llm_parse, "_client", lambda: fake)


def test_endpoint_503_when_unconfigured(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    resp = client.post("/parse", json=REQ)
    assert resp.status_code == 503


def test_llm_success_path(monkeypatch):
    parsed = ParsedTask(
        is_task=True,
        title="Draft Q3 investor update",
        estimated_minutes=90,
        energy_tag="deep",
        deadline=datetime(2026, 7, 24, 17, 0, tzinfo=timezone.utc),
        suggested_project="Fundraising",
        confidence=0.82,
    )
    _use_client(monkeypatch, FakeClient(result=FakeResult(parsed)))
    out = parse_capture(ParseRequest(**REQ))
    assert out.source == "llm"
    assert out.title == "Draft Q3 investor update"
    assert out.energy_tag == "deep"


def test_api_error_falls_back(monkeypatch):
    _use_client(monkeypatch, FakeClient(error=anthropic.APIConnectionError(request=None)))
    out = parse_capture(ParseRequest(**REQ))
    assert out.source == "fallback"
    assert out.is_task is True
    assert out.title == REQ["text"]
    assert out.confidence == 0.0


def test_none_parsed_output_falls_back(monkeypatch):
    _use_client(monkeypatch, FakeClient(result=FakeResult(None)))
    out = parse_capture(ParseRequest(**REQ))
    assert out.source == "fallback"


def test_past_deadline_is_dropped(monkeypatch):
    now = datetime(2026, 7, 20, 9, 0, tzinfo=timezone.utc)
    parsed = ParsedTask(
        is_task=True,
        title="Pay rent",
        deadline=now - timedelta(days=2),
        confidence=0.9,
    )
    _use_client(monkeypatch, FakeClient(result=FakeResult(parsed)))
    out = parse_capture(ParseRequest(**REQ))
    assert out.deadline is None


@pytest.mark.parametrize("bad", [{"text": ""}, {"text": "x" * 2001}])
def test_endpoint_validates_input(monkeypatch, bad):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test")
    resp = client.post("/parse", json={**REQ, **bad})
    assert resp.status_code == 422
