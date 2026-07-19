# Reflow scheduler service

FastAPI service owning exactly two responsibilities:

- `POST /schedule` — the deterministic re-flow engine (pure, <50ms, no LLM)
- `POST /parse` and `POST /reflect` — the LLM edges (Anthropic API, structured outputs)

## Run

```bash
cd services/scheduler
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
```

## Test

```bash
pytest
```
