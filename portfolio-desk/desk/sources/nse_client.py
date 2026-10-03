"""NSE client.

NSE's JSON endpoints require a session cookie picked up from the website first,
a browser User-Agent, and polite pacing. Everything goes through one client so
there is a single place holding the session, the 1-request-per-second floor,
retries and the day cache.

Step 1 only needs the equity quote (does this symbol exist on NSE). Option
chain, India VIX, FII/DII and the holiday list are added in later steps.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from .. import config
from .http import DayCache, HttpClient, SourceUnavailable

log = logging.getLogger(__name__)

BASE = "https://www.nseindia.com"
HOME_URL = f"{BASE}/"
QUOTE_EQUITY_URL = f"{BASE}/api/quote-equity"
SEARCH_URL = f"{BASE}/api/search/autocomplete"
ALL_INDICES_URL = f"{BASE}/api/allIndices"
FII_DII_URL = f"{BASE}/api/fiidiiTradeReact"
HOLIDAY_URL = f"{BASE}/api/holiday-master"
OPTION_CHAIN_INDEX_URL = f"{BASE}/api/option-chain-indices"
OPTION_CHAIN_EQUITY_URL = f"{BASE}/api/option-chain-equities"
# NSE moved the chain to a versioned endpoint and the old paths now 404, so try
# the new one first and keep the old as the fallback.
OPTION_CHAIN_V3_URL = f"{BASE}/api/option-chain-v3"


@dataclass(frozen=True)
class EquityInfo:
    symbol: str
    company_name: str | None
    series: str | None
    is_fno: bool


class NseClient:
    source = "nse"

    def __init__(self, *, cache: DayCache | None = None) -> None:
        self.http = HttpClient(
            self.source,
            min_interval=config.NSE_MIN_INTERVAL_SECONDS,
            headers={"Referer": BASE + "/", "Accept": "*/*"},
            cache=cache if cache is not None else DayCache("nse"),
        )
        self._primed = False

    @property
    def failures(self) -> list[str]:
        return self.http.failures

    def _prime_session(self) -> None:
        """Fetch the homepage once so the session carries NSE's cookies."""
        if self._primed:
            return
        try:
            self.http.session.get(
                HOME_URL, timeout=config.REQUEST_TIMEOUT_SECONDS
            )
        except Exception as exc:  # noqa: BLE001 - priming is best effort
            log.debug("NSE session priming failed: %s", exc)
        self._primed = True

    def equity_info(self, symbol: str) -> EquityInfo | None:
        """Return basic info for an NSE symbol, or None if NSE has no such symbol."""
        self._prime_session()
        response = self.http.get_json(
            QUOTE_EQUITY_URL,
            params={"symbol": symbol},
            cache_key=f"quote-equity-{symbol}",
        )
        if response.status == 404 or response.payload in (None, {}, []):
            return None
        if not response.ok or not isinstance(response.payload, dict):
            raise SourceUnavailable(self.source, f"{symbol}: HTTP {response.status}")

        payload = response.payload
        info = payload.get("info") if isinstance(payload.get("info"), dict) else {}
        metadata = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
        resolved = info.get("symbol") or metadata.get("symbol") or payload.get("symbol")
        if not resolved:
            return None
        return EquityInfo(
            symbol=str(resolved),
            company_name=info.get("companyName") or metadata.get("industry") or None,
            series=metadata.get("series") or (info.get("activeSeries") or [None])[0],
            is_fno=bool(info.get("isFNOSec")),
        )

    def all_indices(self) -> dict[str, dict[str, float | None]]:
        """Every NSE index with its last value and day change, keyed by name.

        This is also where India VIX comes from.
        """
        self._prime_session()
        response = self.http.get_json(ALL_INDICES_URL, cache_key="all-indices")
        if not response.ok or not isinstance(response.payload, dict):
            raise SourceUnavailable(self.source, f"allIndices: HTTP {response.status}")
        out: dict[str, dict[str, float | None]] = {}
        for row in response.payload.get("data") or []:
            if not isinstance(row, dict) or not row.get("index"):
                continue
            out[str(row["index"]).strip()] = {
                "last": _number(row.get("last")),
                "change_pct": _number(row.get("percentChange")),
                "prev_close": _number(row.get("previousClose")),
            }
        return out

    def india_vix(self) -> float | None:
        for name, values in self.all_indices().items():
            if name.upper().replace(" ", "") == "INDIAVIX":
                return values.get("last")
        return None

    def fii_dii(self) -> list[dict[str, Any]]:
        """Provisional FII/DII cash-market figures for the last session."""
        self._prime_session()
        response = self.http.get_json(FII_DII_URL, cache_key="fii-dii")
        if not response.ok or not isinstance(response.payload, list):
            raise SourceUnavailable(self.source, f"fiidiiTradeReact: HTTP {response.status}")
        return [row for row in response.payload if isinstance(row, dict)]

    def trading_holidays(self) -> list[str]:
        """Dates NSE's equity segment is shut, as ISO strings."""
        self._prime_session()
        response = self.http.get_json(
            HOLIDAY_URL, params={"type": "trading"}, cache_key="holiday-master"
        )
        if not response.ok or not isinstance(response.payload, dict):
            raise SourceUnavailable(self.source, f"holiday-master: HTTP {response.status}")
        out: list[str] = []
        for rows in response.payload.values():
            if not isinstance(rows, list):
                continue
            for row in rows:
                if isinstance(row, dict) and row.get("tradingDate"):
                    parsed = _parse_nse_date(str(row["tradingDate"]))
                    if parsed:
                        out.append(parsed)
        return sorted(set(out))

    def option_chain(self, symbol: str, *, is_index: bool) -> tuple[list[dict[str, Any]], str | None]:
        """Chain rows plus the nearest expiry. F&O instruments only."""
        self._prime_session()
        attempts = [
            (OPTION_CHAIN_V3_URL,
             {"type": "Indices" if is_index else "Equity", "symbol": symbol}),
            (OPTION_CHAIN_INDEX_URL if is_index else OPTION_CHAIN_EQUITY_URL,
             {"symbol": symbol}),
        ]
        response = None
        for url, params in attempts:
            response = self.http.get_json(
                url, params=params, cache_key=f"option-chain-{symbol}-{url[-12:]}"
            )
            if response.ok and isinstance(response.payload, dict):
                break
        if response is None or not response.ok or not isinstance(response.payload, dict):
            status = response.status if response else "no response"
            raise SourceUnavailable(self.source, f"option-chain {symbol}: HTTP {status}")
        records = response.payload.get("records")
        if not isinstance(records, dict):
            return [], None
        rows = [r for r in (records.get("data") or []) if isinstance(r, dict)]
        expiries = records.get("expiryDates") or []
        return rows, (str(expiries[0]) if expiries else None)

    def search(self, query: str, *, limit: int = 6) -> list[tuple[str, str]]:
        """NSE autocomplete: [(symbol, company name)]. Empty list means no match."""
        self._prime_session()
        try:
            response = self.http.get_json(
                SEARCH_URL, params={"q": query}, cache_key=f"search-{query}"
            )
        except SourceUnavailable:
            return []
        if not response.ok or not isinstance(response.payload, dict):
            return []
        out: list[tuple[str, str]] = []
        for row in response.payload.get("symbols") or []:
            if not isinstance(row, dict):
                continue
            symbol = row.get("symbol")
            if not symbol:
                continue
            out.append((str(symbol), str(row.get("symbol_info") or row.get("symbol_suggest") or "")))
            if len(out) >= limit:
                break
        return out



def _number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.replace(",", "").strip())
        except ValueError:
            return None
    return None


def _parse_nse_date(text: str) -> str | None:
    """NSE writes holiday dates as "26-Jan-2026"."""
    for fmt in ("%d-%b-%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(text.strip(), fmt).date().isoformat()
        except ValueError:
            continue
    return None
