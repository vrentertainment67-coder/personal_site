"""Relative strength: the stock against its sector and against the market.

A 40% fall means one thing when the sector fell 35% alongside it, and quite
another when the sector is flat. The scorecard could not tell those apart, so
every drawdown read the same. This module is the difference.

Returns are computed from the same daily closes the levels engine uses, over
roughly one, three and twelve months of trading sessions.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

# Trading sessions, not calendar days.
WINDOWS = {"1m": 21, "3m": 63, "12m": 252}

# Each holdings sector maps to the Nifty index that represents it. Sectors with
# no clean index (Conglomerate, Unlisted) fall back to the market comparison
# alone rather than being forced into one that does not fit.
SECTOR_INDEX = {
    "IT": "NIFTY IT",
    "Banks": "NIFTY BANK",
    "Auto": "NIFTY AUTO",
    "Healthcare": "NIFTY PHARMA",
    "Metals & Mining": "NIFTY METAL",
    "Oil & Gas": "NIFTY ENERGY",
    "Power": "NIFTY ENERGY",
    "FMCG": "NIFTY FMCG",
    "Financials": "NIFTY FIN SERVICE",
    "Infra & Ports": "NIFTY INFRA",
    "Building Materials": "NIFTY INFRA",
    "Realty": "NIFTY REALTY",
}

MARKET = "NIFTY 50"


@dataclass(frozen=True)
class Relative:
    symbol: str
    sector: str
    sector_index: str | None
    stock: dict[str, float]            # window -> return %
    sector_returns: dict[str, float]
    market_returns: dict[str, float]

    def vs_sector(self, window: str = "3m") -> float | None:
        if window not in self.stock or window not in self.sector_returns:
            return None
        return self.stock[window] - self.sector_returns[window]

    def vs_market(self, window: str = "3m") -> float | None:
        if window not in self.stock or window not in self.market_returns:
            return None
        return self.stock[window] - self.market_returns[window]

    @property
    def verdict(self) -> str:
        """Whose problem is this — the stock's, or everyone's?"""
        gap = self.vs_sector("3m")
        if gap is None:
            gap = self.vs_market("3m")
            if gap is None:
                return "unknown"
        if gap <= -10:
            return "much worse than its sector"
        if gap <= -3:
            return "worse than its sector"
        if gap >= 10:
            return "much better than its sector"
        if gap >= 3:
            return "better than its sector"
        return "in line with its sector"

    def sentence(self) -> str | None:
        """One line a human can check against the numbers."""
        stock_3m = self.stock.get("3m")
        if stock_3m is None:
            return None
        sector_3m = self.sector_returns.get("3m")
        market_3m = self.market_returns.get("3m")

        if sector_3m is not None and self.sector_index:
            gap = stock_3m - sector_3m
            shared = "the fall is sector-wide" if stock_3m < 0 and sector_3m < 0 else ""
            tail = f"; {shared}" if shared and abs(gap) < 3 else ""
            return (
                f"{stock_3m:+.0f}% over 3 months against {self.sector_index} "
                f"{sector_3m:+.0f}% ({gap:+.0f}% relative){tail}"
            )
        if market_3m is not None:
            return (
                f"{stock_3m:+.0f}% over 3 months against the Nifty {market_3m:+.0f}% "
                f"({stock_3m - market_3m:+.0f}% relative); no sector index for {self.sector}"
            )
        return f"{stock_3m:+.0f}% over 3 months"


def returns(closes: Sequence[float]) -> dict[str, float]:
    """Return % over each window that the series is long enough to cover."""
    out: dict[str, float] = {}
    for name, sessions in WINDOWS.items():
        if len(closes) <= sessions:
            continue
        start, end = closes[-(sessions + 1)], closes[-1]
        if start:
            out[name] = (end / start - 1) * 100
    return out


def compare(
    symbol: str,
    sector: str,
    closes: Sequence[float],
    index_closes: dict[str, Sequence[float]],
) -> Relative | None:
    """Build the comparison, or None when the stock has too little history."""
    stock = returns(closes)
    if not stock:
        return None
    index_name = SECTOR_INDEX.get(sector)
    sector_series = index_closes.get(index_name or "", [])
    return Relative(
        symbol=symbol,
        sector=sector,
        sector_index=index_name if sector_series else None,
        stock=stock,
        sector_returns=returns(sector_series) if sector_series else {},
        market_returns=returns(index_closes.get(MARKET, [])),
    )
