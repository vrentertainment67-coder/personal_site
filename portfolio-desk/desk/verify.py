"""`verify-symbols`: check every listed holding's ticker resolves.

Three outcomes per holding, and the difference matters:

* OK        — Yahoo (or NSE) returned a quote for the ticker in holdings.json.
* BAD       — the source answered and said the ticker does not exist. Vic must
              correct it; suggestions from a name search are printed alongside.
* UNKNOWN   — no source could be reached. Nothing is said about the ticker.

A run that produced any BAD, or that could not verify a row flagged
`verify_symbol: true`, stops the pipeline: the rest of the desk would quietly
build a brief around a missing stock otherwise.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum

from .holdings import Holding, Portfolio
from .sources.http import SourceUnavailable
from .sources.nse_client import NseClient
from .sources.yahoo import Match, YahooClient


class Status(str, Enum):
    OK = "ok"
    BAD = "bad"
    UNKNOWN = "unknown"
    SKIPPED = "skipped"


@dataclass
class Result:
    holding: Holding
    status: Status
    detail: str = ""
    resolved_name: str | None = None
    last_price: float | None = None
    suggestions: list[str] = field(default_factory=list)
    checked_with: str | None = None

    @property
    def name(self) -> str:
        return self.holding.name

    @property
    def ticker(self) -> str:
        return self.holding.yahoo_ticker or "—"

    @property
    def flagged(self) -> bool:
        """Was this row marked as a guessed ticker in holdings.json?"""
        return self.holding.verify_symbol


@dataclass
class Report:
    results: list[Result] = field(default_factory=list)
    source_failures: dict[str, list[str]] = field(default_factory=dict)

    def of(self, status: Status) -> list[Result]:
        return [r for r in self.results if r.status is status]

    @property
    def bad(self) -> list[Result]:
        return self.of(Status.BAD)

    @property
    def unknown(self) -> list[Result]:
        return self.of(Status.UNKNOWN)

    @property
    def ok(self) -> list[Result]:
        return self.of(Status.OK)

    @property
    def skipped(self) -> list[Result]:
        return self.of(Status.SKIPPED)

    @property
    def unverified_flagged(self) -> list[Result]:
        """Guessed tickers we could not confirm — these were the whole point."""
        return [r for r in self.unknown if r.flagged]

    @property
    def blocked(self) -> bool:
        """True when the pipeline must stop and wait for Vic."""
        return bool(self.bad or self.unverified_flagged)

    @property
    def all_sources_down(self) -> bool:
        return bool(self.results) and not self.ok and not self.bad and bool(self.unknown)


def verify_holding(
    holding: Holding,
    *,
    yahoo: YahooClient,
    nse: NseClient | None = None,
    suggest: bool = True,
) -> Result:
    """Check one holding's ticker against Yahoo, falling back to NSE."""
    if not holding.is_listed:
        return Result(
            holding=holding,
            status=Status.SKIPPED,
            detail=holding.notes or "unlisted; excluded from price fetches",
        )

    ticker = holding.yahoo_ticker or ""
    yahoo_detail = ""
    try:
        quote = yahoo.quote(ticker)
    except SourceUnavailable as exc:
        yahoo_detail = exc.detail
    else:
        if quote is not None:
            return Result(
                holding=holding,
                status=Status.OK,
                detail=f"{quote.exchange or 'Yahoo'} quote found",
                resolved_name=quote.name,
                last_price=quote.last_price,
                checked_with="yahoo",
            )
        # Yahoo answered and has no such ticker. NSE may still know the symbol
        # (newly listed names take a while to appear on Yahoo), so ask it.
        nse_result = _check_nse(holding, nse)
        if nse_result is not None:
            return nse_result
        return Result(
            holding=holding,
            status=Status.BAD,
            detail=f"no Yahoo ticker {ticker!r}",
            suggestions=_suggest(holding, yahoo=yahoo, nse=nse) if suggest else [],
            checked_with="yahoo",
        )

    # Yahoo unreachable — try NSE before giving up.
    nse_result = _check_nse(holding, nse)
    if nse_result is not None:
        return nse_result
    return Result(
        holding=holding,
        status=Status.UNKNOWN,
        detail=f"yahoo unavailable ({yahoo_detail})" if yahoo_detail else "no source reachable",
    )


def _check_nse(holding: Holding, nse: NseClient | None) -> Result | None:
    """Return an OK/BAD result from NSE, or None when NSE could not answer."""
    if nse is None or not holding.nse_symbol:
        return None
    try:
        info = nse.equity_info(holding.nse_symbol)
    except SourceUnavailable:
        return None
    if info is None:
        return None  # NSE has no such symbol; let the caller decide
    return Result(
        holding=holding,
        status=Status.OK,
        detail=f"NSE symbol found (series {info.series or '?'})",
        resolved_name=info.company_name,
        checked_with="nse",
    )


def _suggest(holding: Holding, *, yahoo: YahooClient, nse: NseClient | None) -> list[str]:
    """Ticker suggestions from a company-name search, best effort."""
    suggestions: list[str] = []
    try:
        matches: list[Match] = yahoo.search(holding.name)
    except SourceUnavailable:
        matches = []
    for match in matches:
        if match.quote_type and match.quote_type.upper() not in {"EQUITY", "ETF", "INDEX"}:
            continue
        suggestions.append(str(match))
    if nse is not None and holding.nse_symbol:
        for symbol, label in nse.search(holding.name):
            entry = f"{symbol}.NS (NSE: {label})" if label else f"{symbol}.NS (NSE)"
            if entry not in suggestions:
                suggestions.append(entry)
    return suggestions[:6]


def verify_portfolio(
    portfolio: Portfolio,
    *,
    yahoo: YahooClient | None = None,
    nse: NseClient | None = None,
    only_flagged: bool = False,
    suggest: bool = True,
) -> Report:
    """Verify every listed holding (or only the `verify_symbol: true` rows)."""
    yahoo = yahoo or YahooClient()
    nse = nse if nse is not None else NseClient()

    rows = portfolio.needs_symbol_check if only_flagged else portfolio.holdings
    report = Report()
    for holding in rows:
        report.results.append(verify_holding(holding, yahoo=yahoo, nse=nse, suggest=suggest))

    for client in (yahoo, nse):
        if client is not None and client.failures:
            report.source_failures[client.source] = list(dict.fromkeys(client.failures))[:5]
    return report
