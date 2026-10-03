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

from .. import config
from .http import DayCache, HttpClient, SourceUnavailable

log = logging.getLogger(__name__)

BASE = "https://www.nseindia.com"
HOME_URL = f"{BASE}/"
QUOTE_EQUITY_URL = f"{BASE}/api/quote-equity"
SEARCH_URL = f"{BASE}/api/search/autocomplete"


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

