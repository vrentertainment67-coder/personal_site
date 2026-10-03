"""Option-chain arithmetic: PCR, the OI walls, and max pain.

Pure functions over chain rows so they can be tested without NSE. A row is
`{"strikePrice": float, "CE": {"openInterest": n, ...}, "PE": {...}}`, which is
the shape NSE's option-chain JSON returns.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable, Sequence


@dataclass(frozen=True)
class ChainSummary:
    expiry: str | None
    pcr: float | None
    call_oi_total: float
    put_oi_total: float
    highest_call_oi_strike: float | None  # resistance
    highest_put_oi_strike: float | None   # support
    max_pain: float | None


def _oi(side: Any) -> float:
    if not isinstance(side, dict):
        return 0.0
    value = side.get("openInterest")
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return 0.0
    return float(value)


def max_pain(rows: Sequence[dict[str, Any]]) -> float | None:
    """The strike where option writers lose least — i.e. buyers lose most.

    For each candidate settlement price, add up what every open call and put
    would pay out, and take the cheapest.
    """
    strikes = sorted({float(r["strikePrice"]) for r in rows if r.get("strikePrice") is not None})
    if not strikes:
        return None

    best_strike, best_pain = None, None
    for settle in strikes:
        pain = 0.0
        for row in rows:
            strike = float(row.get("strikePrice") or 0)
            if settle > strike:
                pain += _oi(row.get("CE")) * (settle - strike)
            if settle < strike:
                pain += _oi(row.get("PE")) * (strike - settle)
        if best_pain is None or pain < best_pain:
            best_strike, best_pain = settle, pain
    return best_strike


def summarise(rows: Iterable[dict[str, Any]], *, expiry: str | None = None) -> ChainSummary:
    rows = [r for r in rows if isinstance(r, dict) and r.get("strikePrice") is not None]
    if expiry:
        rows = [r for r in rows if r.get("expiryDate") == expiry]

    call_total = sum(_oi(r.get("CE")) for r in rows)
    put_total = sum(_oi(r.get("PE")) for r in rows)

    call_rows = [(float(r["strikePrice"]), _oi(r.get("CE"))) for r in rows]
    put_rows = [(float(r["strikePrice"]), _oi(r.get("PE"))) for r in rows]
    top_call = max(call_rows, key=lambda pair: pair[1], default=(None, 0.0))
    top_put = max(put_rows, key=lambda pair: pair[1], default=(None, 0.0))

    return ChainSummary(
        expiry=expiry,
        pcr=(put_total / call_total) if call_total else None,
        call_oi_total=call_total,
        put_oi_total=put_total,
        highest_call_oi_strike=top_call[0] if top_call[1] else None,
        highest_put_oi_strike=top_put[0] if top_put[1] else None,
        max_pain=max_pain(rows),
    )
