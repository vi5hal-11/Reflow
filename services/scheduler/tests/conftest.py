"""Test-wide fixtures.

`app.main` calls `load_dotenv()` at import time, so on a developer machine with
a real GEMINI_API_KEY in `services/scheduler/.env`, importing the app once (via
TestClient) leaks that key into `os.environ` for the whole session. Every
LLM-edge test would then hit the live API and assert against non-deterministic
model output — the suite passed in CI purely because CI has no key.

The edges are specified by their *deterministic fallback* behaviour, so tests
run with the key removed. A test that genuinely wants the LLM path can set it
back with its own monkeypatch.
"""

import pytest


@pytest.fixture(autouse=True)
def _no_llm_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
