"""Thin Gemini client for the LLM edges (founder call: free tier, no Claude).

Plain REST via httpx — the surface we need is one endpoint, and Google's
free-tier quota (AI Studio key, no card) comfortably covers parse-on-capture
plus one reflection a day. JSON output is schema-constrained at sampling time
via responseSchema, then re-validated with Pydantic by the callers (never
trust LLM output).
"""

import json
import os

import httpx

GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"
TIMEOUT_SECONDS = 20.0


class GeminiError(Exception):
    pass


def is_configured() -> bool:
    return bool(os.environ.get("GEMINI_API_KEY"))


def generate_json(
    system: str,
    prompt: str,
    schema: dict,
    max_output_tokens: int = 1024,
) -> dict:
    """One schema-constrained generation; returns the parsed JSON object."""
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        raise GeminiError("GEMINI_API_KEY is not configured")

    response = httpx.post(
        f"{GEMINI_BASE}/models/{GEMINI_MODEL}:generateContent",
        headers={"x-goog-api-key": key, "content-type": "application/json"},
        json={
            "system_instruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "responseSchema": schema,
                "maxOutputTokens": max_output_tokens,
            },
        },
        timeout=TIMEOUT_SECONDS,
    )
    if response.status_code != 200:
        raise GeminiError(f"generateContent returned {response.status_code}")
    try:
        text = response.json()["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError, ValueError) as exc:
        raise GeminiError("generateContent returned an unexpected shape") from exc
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        raise GeminiError("model returned non-JSON output") from exc
    if not isinstance(parsed, dict):
        raise GeminiError("model returned a non-object")
    return parsed
