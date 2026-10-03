"""Company fundamentals from Yahoo's quoteSummary endpoint.

This is the layer the price-only scorecard was missing: valuation, profitability,
leverage and growth, plus the next earnings date. Yahoo gates quoteSummary behind
a cookie and a crumb, so the client collects both once and reuses them.

Coverage for Indian names is uneven — a newly listed company often has no P/E and
a loss-making one has none by definition. Every field is optional and a missing
one narrows the scorecard rather than being filled in with a guess.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Any

from .http import DayCache, HttpClient, SourceUnavailable

COOKIE_URL = "https://fc.yahoo.com/"
CRUMB_URL = "https://query2.finance.yahoo.com/v1/test/getcrumb"
SUMMARY_URL = "https://query2.finance.yahoo.com/v10/finance/quoteSummary/{ticker}"
MODULES = "summaryDetail,defaultKeyStatistics,financialData,calendarEvents"

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class Fundamentals:
    symbol: str
    pe: float | None = None
    forward_pe: float | None = None
    price_to_book: float | None = None
    dividend_yield_pct: float | None = None
    market_cap: float | None = None
    roe_pct: float | None = None
    operating_margin_pct: float | None = None
    profit_margin_pct: float | None = None
    debt_to_equity: float | None = None      # a ratio: 0.11 means 11 paise of debt per rupee of equity
    revenue_growth_pct: float | None = None
    earnings_growth_pct: float | None = None
    target_mean: float | None = None
    recommendation: str | None = None
    analyst_count: int | None = None
    earnings_date: str | None = None

    @property
    def has_valuation(self) -> bool:
        return any(v is not None for v in (self.pe, self.forward_pe, self.price_to_book))

    @property
    def has_quality(self) -> bool:
        return any(
            v is not None
            for v in (self.roe_pct, self.operating_margin_pct, self.debt_to_equity)
        )

    def days_to_earnings(self, today: date | None = None) -> int | None:
        if not self.earnings_date:
            return None
        try:
            when = date.fromisoformat(self.earnings_date)
        except ValueError:
            return None
        return (when - (today or date.today())).days


class FundamentalsClient:
    source = "yahoo (fundamentals)"

    def __init__(self, *, cache: DayCache | None = None) -> None:
        self.http = HttpClient(
            self.source,
            min_interval=0.3,
            cache=cache if cache is not None else DayCache("fundamentals"),
        )
        self._crumb: str | None = None
        self._primed = False

    @property
    def failures(self) -> list[str]:
        return self.http.failures

    def _prime(self) -> None:
        """One cookie fetch, one crumb fetch, reused for every ticker."""
        if self._primed:
            return
        self._primed = True
        try:
            self.http.session.get(COOKIE_URL, timeout=10)
        except Exception as exc:  # noqa: BLE001 - priming is best effort
            log.debug("cookie fetch failed: %s", exc)
        try:
            crumb = self.http.get_text(CRUMB_URL, retries=2)
        except SourceUnavailable as exc:
            log.warning("crumb fetch failed: %s", exc.detail)
            return
        crumb = (crumb or "").strip()
        # A valid crumb is a short opaque token; an HTML error page is not.
        if crumb and len(crumb) < 32 and "<" not in crumb:
            self._crumb = crumb

    def fetch(self, symbol: str, ticker: str) -> Fundamentals | None:
        """Fundamentals for one ticker, or None when Yahoo has nothing."""
        self._prime()
        params: dict[str, Any] = {"modules": MODULES}
        if self._crumb:
            params["crumb"] = self._crumb

        response = self.http.get_json(
            SUMMARY_URL.format(ticker=ticker), params=params, cache_key=f"summary-{ticker}"
        )
        if response.status in (401, 403, 404):
            return None
        if not response.ok or not isinstance(response.payload, dict):
            raise SourceUnavailable(self.source, f"{ticker}: HTTP {response.status}")

        results = ((response.payload.get("quoteSummary") or {}).get("result")) or []
        if not results:
            return None
        return _parse(symbol, results[0])


def _parse(symbol: str, result: dict[str, Any]) -> Fundamentals:
    detail = result.get("summaryDetail") or {}
    stats = result.get("defaultKeyStatistics") or {}
    financial = result.get("financialData") or {}
    events = result.get("calendarEvents") or {}

    return Fundamentals(
        symbol=symbol,
        pe=_raw(detail.get("trailingPE")),
        forward_pe=_raw(detail.get("forwardPE")) or _raw(stats.get("forwardPE")),
        price_to_book=_raw(stats.get("priceToBook")),
        dividend_yield_pct=_pct(detail.get("dividendYield")),
        market_cap=_raw(detail.get("marketCap")),
        roe_pct=_pct(financial.get("returnOnEquity")),
        operating_margin_pct=_pct(financial.get("operatingMargins")),
        profit_margin_pct=_pct(financial.get("profitMargins")),
        # Yahoo reports this as a percentage (11 means 0.11x). Storing it raw
        # made Coal India look eleven times levered instead of barely levered.
        debt_to_equity=_ratio(financial.get("debtToEquity")),
        revenue_growth_pct=_sane_growth(_pct(financial.get("revenueGrowth"))),
        earnings_growth_pct=_sane_growth(_pct(financial.get("earningsGrowth"))),
        target_mean=_raw(financial.get("targetMeanPrice")),
        recommendation=financial.get("recommendationKey") or None,
        analyst_count=_int(financial.get("numberOfAnalystOpinions")),
        earnings_date=_earnings_date(events),
    )


def _raw(field: Any) -> float | None:
    """Yahoo wraps numbers as {"raw": 12.3, "fmt": "12.30"}."""
    if isinstance(field, dict):
        field = field.get("raw")
    if isinstance(field, bool) or not isinstance(field, (int, float)):
        return None
    return float(field)


def _pct(field: Any) -> float | None:
    """Ratios arrive as fractions; report them as percentages."""
    value = _raw(field)
    return None if value is None else value * 100


def _ratio(field: Any) -> float | None:
    """debtToEquity arrives as a percentage; return the ratio it means."""
    value = _raw(field)
    return None if value is None else value / 100


# A quarter can genuinely swing, but a reported move beyond this is far more
# often a Yahoo artefact (a restated base, a merger) than a real figure, and it
# would otherwise drive the quality score on its own.
GROWTH_SANITY_PCT = 100.0


def _sane_growth(value: float | None) -> float | None:
    if value is None or abs(value) > GROWTH_SANITY_PCT:
        return None
    return value


def _int(field: Any) -> int | None:
    value = _raw(field)
    return None if value is None else int(value)


def _earnings_date(events: dict[str, Any]) -> str | None:
    earnings = events.get("earnings") or {}
    dates = earnings.get("earningsDate") or []
    for entry in dates:
        stamp = _raw(entry)
        if stamp:
            return datetime.fromtimestamp(stamp, tz=timezone.utc).date().isoformat()
    return None
