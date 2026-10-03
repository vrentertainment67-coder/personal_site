"""The written brief: one Claude call over a payload of precomputed figures.

Claude never sees a price feed and never does arithmetic. It receives JSON that
Python already computed, and arranges it into prose. Every number it writes is
checked back against that JSON; a brief that cites a figure the payload does not
contain is regenerated, and if it fails again the brief is dropped rather than
published.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any

from . import config
from .numbers import check

log = logging.getLogger(__name__)

PROMPT_FILE = config.ROOT / "prompts" / "brief.md"
MAX_TOKENS = 2000
MAX_ATTEMPTS = 2

# Models that accept the server-side refusal fallback in its "default" form.
FALLBACK_MODELS = ("claude-opus-5", "claude-opus-5-5", "claude-sonnet-5-5", "claude-fable-5")
FALLBACK_BETA = "server-side-fallback-2026-07-01"

# Phrases that would make this advice rather than description. The prompt
# forbids them; this is the backstop.
ADVICE_PATTERNS = (
    r"\byou should\b", r"\bi (?:would|'d) (?:buy|sell|add|trim|exit)\b",
    r"\b(?:recommend|suggest)\w*\b", r"\bbook (?:profits?|losses)\b",
    r"\btime to (?:buy|sell|exit|add)\b", r"\bworth (?:buying|selling|adding)\b",
)


@dataclass
class BriefResult:
    text: str | None
    model: str
    attempts: int = 0
    ok: bool = False
    failure: str | None = None
    rejected_numbers: list[str] = field(default_factory=list)
    advice_phrases: list[str] = field(default_factory=list)
    usage: dict[str, int] = field(default_factory=dict)

    @property
    def status(self) -> str:
        if self.ok:
            return "ok"
        return "failed"


def load_prompt(path: Path | None = None) -> tuple[str, str]:
    """Split prompts/brief.md into the system prompt and the user template."""
    text = (path or PROMPT_FILE).read_text(encoding="utf-8")
    system_part = _section(text, "## System")
    user_part = _section(text, "## User message")
    structure = _section(text, "## Structure")
    system = "\n\n".join(p for p in (system_part, "## Structure\n\n" + structure if structure else "") if p)
    return system.strip(), (user_part or "{{PAYLOAD}}").strip()


def _section(text: str, heading: str) -> str:
    pattern = re.compile(
        rf"^{re.escape(heading)}\s*\n(.*?)(?=^## |\Z)", re.S | re.M
    )
    match = pattern.search(text)
    return match.group(1).strip() if match else ""


def find_advice(text: str) -> list[str]:
    found: list[str] = []
    for pattern in ADVICE_PATTERNS:
        for match in re.finditer(pattern, text, re.I):
            found.append(match.group().strip())
    return list(dict.fromkeys(found))


def _text_of(response: Any) -> str:
    parts = []
    for block in getattr(response, "content", []) or []:
        if getattr(block, "type", None) == "text":
            parts.append(block.text)
    return "\n".join(parts).strip()


def _usage_of(response: Any) -> dict[str, int]:
    usage = getattr(response, "usage", None)
    if usage is None:
        return {}
    out = {}
    for field_name in ("input_tokens", "output_tokens", "cache_read_input_tokens"):
        value = getattr(usage, field_name, None)
        if isinstance(value, int):
            out[field_name] = value
    return out


def generate(
    payload: dict[str, Any],
    *,
    client: Any | None = None,
    model: str | None = None,
    prompt_path: Path | None = None,
    max_attempts: int = MAX_ATTEMPTS,
) -> BriefResult:
    """Ask Claude for the brief, then verify every number in it.

    `client` is injectable so the whole path can be tested without the API.
    """
    settings = config.Settings.from_env()
    model = model or settings.anthropic_model
    result = BriefResult(text=None, model=model)

    if client is None:
        if not settings.anthropic_api_key:
            result.failure = "ANTHROPIC_API_KEY is not set"
            return result
        try:
            import anthropic
        except ImportError:
            result.failure = "the anthropic package is not installed"
            return result
        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    system, user_template = load_prompt(prompt_path)
    payload_json = json.dumps(payload, indent=2, ensure_ascii=False, default=str)
    user = user_template.replace("{{PAYLOAD}}", payload_json)
    correction = ""

    for attempt in range(1, max_attempts + 1):
        result.attempts = attempt
        try:
            response = _call(client, model=model, system=system, user=user + correction)
        except Exception as exc:  # noqa: BLE001 - the brief must never break the run
            result.failure = f"{type(exc).__name__}: {exc}"
            log.warning("brief generation failed: %s", result.failure)
            return result

        if getattr(response, "stop_reason", None) == "refusal":
            details = getattr(response, "stop_details", None)
            result.failure = f"model declined ({getattr(details, 'category', 'unknown')})"
            return result

        text = _text_of(response)
        result.usage = _usage_of(response)
        if not text:
            result.failure = "empty response"
            return result

        ok, bad_numbers = check(text, payload)
        advice = find_advice(text)
        if ok and not advice:
            result.text, result.ok, result.failure = text, True, None
            result.rejected_numbers, result.advice_phrases = [], []
            return result

        result.rejected_numbers, result.advice_phrases = bad_numbers, advice
        problems = []
        if bad_numbers:
            problems.append(
                "These numbers are not in the payload: "
                + ", ".join(bad_numbers)
                + ". Use only figures present in the JSON, or leave the figure out."
            )
        if advice:
            problems.append(
                "This reads as a recommendation: "
                + ", ".join(advice)
                + ". Describe the situation instead."
            )
        correction = "\n\nYour previous draft was rejected. " + " ".join(problems)
        log.warning("brief rejected on attempt %s: %s", attempt, " ".join(problems))

    result.failure = "failed number/advice validation on every attempt"
    result.text = None
    return result


def _call(client: Any, *, model: str, system: str, user: str) -> Any:
    """One Messages call, with the refusal fallback where the model supports it."""
    kwargs: dict[str, Any] = {
        "model": model,
        "max_tokens": MAX_TOKENS,
        "system": system,
        "messages": [{"role": "user", "content": user}],
        # A 350-word note over a small payload: the cheap end of the range is
        # the right place for a job this shaped.
        "output_config": {"effort": "low"},
    }
    if any(model.startswith(prefix) for prefix in FALLBACK_MODELS):
        return client.beta.messages.create(
            betas=[FALLBACK_BETA], fallbacks="default", **kwargs
        )
    return client.messages.create(**kwargs)


def build_payload(
    *,
    as_of: date,
    portfolio_summary: dict[str, Any],
    watchlist: list[dict[str, Any]],
    indices: list[dict[str, Any]],
    sectors: list[dict[str, Any]],
    news: list[dict[str, Any]],
    market: dict[str, Any],
    unavailable: list[str],
) -> dict[str, Any]:
    """The JSON Claude is allowed to draw from. Nothing else reaches the model."""
    return {
        "as_of": as_of.isoformat(),
        "market": market,
        "indices": indices,
        "portfolio": portfolio_summary,
        "watchlist": watchlist,
        "sectors": sectors,
        "news": news,
        "unavailable": unavailable,
    }
