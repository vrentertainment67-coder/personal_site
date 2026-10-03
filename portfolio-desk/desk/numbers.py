"""Check that every number in generated text came from the payload.

The desk's hard rule is that Python computes the figures and Claude only
arranges them. This module enforces it: pull every numeric token out of the
written brief, and fail any that cannot be traced to the JSON it was given.
"""

from __future__ import annotations

import re
from typing import Any, Iterable

# 1,234 · 1,23,456.78 · 12.5 · 0.3
NUMBER_RE = re.compile(r"-?\d[\d,]*(?:\.\d+)?")

# Float noise only. A written figure is supported when, at the precision it was
# written to, it equals a payload value rounded to that precision — "24,853" is
# fine for 24853.15, "22.6 L" is fine for 22.58431 lakh, and "24,612" matches
# nothing at all. A flat percentage tolerance would wave through an invented
# Nifty level 100 points away.
EPSILON = 1e-6
# Years and small ordinals in prose ("Q2", "top 3", "2026") are not claims
# about the portfolio.
SAFE_INTEGERS = frozenset(range(0, 13)) | frozenset(range(2020, 2041))


def _walk(value: Any) -> Iterable[float]:
    """Every number anywhere in the payload, including inside strings."""
    if isinstance(value, bool):
        return
    if isinstance(value, (int, float)):
        yield float(value)
    elif isinstance(value, str):
        for match in NUMBER_RE.finditer(value):
            parsed = _parse(match.group())
            if parsed is not None:
                yield parsed
    elif isinstance(value, dict):
        for item in value.values():
            yield from _walk(item)
    elif isinstance(value, (list, tuple)):
        for item in value:
            yield from _walk(item)


def _parse(token: str) -> float | None:
    try:
        return float(token.replace(",", ""))
    except ValueError:
        return None


def allowed_values(payload: Any) -> set[float]:
    """Every figure the payload states, plus the lakh/crore forms of each."""
    values: set[float] = set()
    for number in _walk(payload):
        values.add(number)
        values.add(abs(number))
        # A brief writes ₹22.6 L for 2,258,431 and ₹1.2 Cr for 12,345,678.
        values.add(abs(number) / 1_00_000)
        values.add(abs(number) / 1_00_00_000)
        values.add(abs(number) / 1_000)
    return values


def _decimals(token: str) -> int:
    _, _, frac = token.partition(".")
    return len(frac)


def unsupported(text: str, payload: Any) -> list[str]:
    """Numeric tokens in `text` that the payload does not support."""
    allowed = allowed_values(payload)
    bad: list[str] = []
    for match in NUMBER_RE.finditer(text):
        token = match.group()
        value = _parse(token)
        if value is None:
            continue
        magnitude = abs(value)
        if magnitude == int(magnitude) and int(magnitude) in SAFE_INTEGERS:
            continue
        places = _decimals(token)
        if any(abs(round(candidate, places) - magnitude) <= EPSILON for candidate in allowed):
            continue
        bad.append(token)
    return list(dict.fromkeys(bad))


def check(text: str, payload: Any) -> tuple[bool, list[str]]:
    bad = unsupported(text, payload)
    return (not bad), bad
