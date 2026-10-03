"""Yahoo Finance lookups used by `verify-symbols`.

Only the two endpoints that work without a crumb/cookie dance:

* chart  — does this ticker exist, and what did it last trade at
* search — what tickers match this company name (used to suggest a fix)
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .http import DayCache, HttpClient, SourceUnavailable

CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
SEARCH_URL = "https://query1.finance.yahoo.com/v1/finance/search"


@dataclass(frozen=True)
class Quote:
    ticker: str
    name: str | None
    exchange: str | None
    currency: str | None
    last_price: float | None
    previous_close: float | None = None


@dataclass(frozen=True)
class Match:
    symbol: str
    name: str | None
    exchange: str | None
    quote_type: str | None

    def __str__(self) -> str:
        bits = [self.symbol]
        if self.name:
            bits.append(f"({self.name}")
            bits[-1] += f", {self.exchange})" if self.exchange else ")"
        elif self.exchange:
            bits.append(f"({self.exchange})")
        return " ".join(bits)


class YahooClient:
    source = "yahoo"

    def __init__(self, *, cache: DayCache | None = None) -> None:
        self.http = HttpClient(
            self.source, cache=cache if cache is not None else DayCache("yahoo")
        )

    @property
    def failures(self) -> list[str]:
        return self.http.failures

    def quote(self, ticker: str) -> Quote | None:
        """Return the quote, or None when Yahoo says the ticker does not exist.

        Raises SourceUnavailable if Yahoo could not be reached.
        """
        response = self.http.get_json(
            CHART_URL.format(ticker=ticker),
            params={"range": "5d", "interval": "1d"},
            cache_key=f"chart-{ticker}",
        )
        payload = response.payload if isinstance(response.payload, dict) else {}
        chart = payload.get("chart") if isinstance(payload.get("chart"), dict) else {}
        error = chart.get("error")
        results = chart.get("result")

        if response.status == 404 or (error and not results):
            return None
        if not response.ok or not results:
            detail = _error_detail(error) or f"HTTP {response.status} with no result"
            raise SourceUnavailable(self.source, f"{ticker}: {detail}")

        meta = results[0].get("meta") if isinstance(results[0], dict) else None
        if not isinstance(meta, dict):
            raise SourceUnavailable(self.source, f"{ticker}: chart result had no meta block")

        return Quote(
            ticker=str(meta.get("symbol") or ticker),
            name=meta.get("longName") or meta.get("shortName"),
            exchange=meta.get("fullExchangeName") or meta.get("exchangeName"),
            currency=meta.get("currency"),
            last_price=_as_float(meta.get("regularMarketPrice")),
            previous_close=_as_float(
                meta.get("chartPreviousClose") or meta.get("previousClose")
            ),
        )

    def search(self, query: str, *, limit: int = 6) -> list[Match]:
        """Suggest tickers for a company name. Empty list means no match."""
        response = self.http.get_json(
            SEARCH_URL,
            params={"q": query, "quotesCount": limit, "newsCount": 0, "lang": "en-IN", "region": "IN"},
            cache_key=f"search-{query}",
        )
        if not response.ok or not isinstance(response.payload, dict):
            return []
        quotes = response.payload.get("quotes")
        if not isinstance(quotes, list):
            return []
        matches = []
        for quote in quotes:
            if not isinstance(quote, dict) or not quote.get("symbol"):
                continue
            matches.append(
                Match(
                    symbol=str(quote["symbol"]),
                    name=quote.get("longname") or quote.get("shortname"),
                    exchange=quote.get("exchDisp") or quote.get("exchange"),
                    quote_type=quote.get("quoteType"),
                )
            )
        return matches


def _error_detail(error: Any) -> str | None:
    if isinstance(error, dict):
        return error.get("description") or error.get("code")
    if isinstance(error, str):
        return error
    return None


def _as_float(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value)
