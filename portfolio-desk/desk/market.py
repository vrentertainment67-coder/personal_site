"""Market data for the portfolio, from whichever source could answer.

Three tiers, in order of preference:

1. `live`     — yfinance/NSE quotes fetched this run
2. `snapshot` — data/prices-snapshot.json, the last close captured with the
                broker-app screenshots (stale, but real and dated)
3. nothing    — the dashboard renders without prices and says so

The tier a price came from travels with it, so the dashboard can stamp every
figure instead of implying it is current.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Literal

from . import config
from .levels import Bar
from .sources.http import SourceUnavailable
from .sources.yahoo import YahooClient

# Indices the desk covers. Yahoo has daily bars for the first three; the rest
# come from NSE's allIndices snapshot (level only, no levels engine).
INDEX_TICKERS = {
    "NIFTY 50": "^NSEI",
    "BANK NIFTY": "^NSEBANK",
    "SENSEX": "^BSESN",
}
NSE_ONLY_INDICES = ("NIFTY FIN SERVICE", "NIFTY MIDCAP SELECT")
SECTOR_INDICES = (
    "NIFTY IT", "NIFTY BANK", "NIFTY AUTO", "NIFTY PHARMA", "NIFTY METAL",
    "NIFTY ENERGY", "NIFTY FMCG", "NIFTY PSU BANK", "NIFTY REALTY",
)
GLOBAL_CUES = {
    "S&P 500": "^GSPC", "Nasdaq": "^IXIC", "Dow": "^DJI", "Nikkei": "^N225",
    "Hang Seng": "^HSI", "WTI crude": "CL=F", "Brent": "BZ=F", "Gold": "GC=F",
    "USD/INR": "INR=X", "US 10Y": "^TNX",
}

Tier = Literal["live", "snapshot", "none"]
Health = Literal["ok", "stale", "failed", "skipped"]

SNAPSHOT_FILE = config.DATA_DIR / "prices-snapshot.json"


@dataclass(frozen=True)
class Price:
    symbol: str
    last: float
    tier: Tier
    as_of: str
    prev_close: float | None = None

    @property
    def day_change_pct(self) -> float | None:
        if self.prev_close in (None, 0):
            return None
        return (self.last / self.prev_close - 1) * 100

    @property
    def day_change(self) -> float | None:
        if self.prev_close is None:
            return None
        return self.last - self.prev_close


@dataclass
class SourceStatus:
    name: str
    health: Health
    detail: str = ""
    label_override: str | None = None

    @property
    def label(self) -> str:
        if self.label_override:
            return self.label_override
        return {"ok": "ok", "stale": "stale", "failed": "failed", "skipped": "not built yet"}[
            self.health
        ]


@dataclass
class MarketData:
    prices: dict[str, Price] = field(default_factory=dict)
    statuses: list[SourceStatus] = field(default_factory=list)
    fetched_at: str = ""

    @property
    def tier(self) -> Tier:
        tiers = {p.tier for p in self.prices.values()}
        if "live" in tiers:
            return "live"
        if "snapshot" in tiers:
            return "snapshot"
        return "none"

    @property
    def as_of(self) -> str | None:
        dates = sorted({p.as_of for p in self.prices.values()})
        return dates[-1] if dates else None

    def get(self, symbol: str | None) -> Price | None:
        return self.prices.get(symbol) if symbol else None

    def status(self, name: str) -> SourceStatus | None:
        for status in self.statuses:
            if status.name == name:
                return status
        return None


def load_snapshot(path: Path | None = None) -> tuple[dict[str, Price], SourceStatus]:
    path = path or SNAPSHOT_FILE
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return {}, SourceStatus("price snapshot", "failed", str(exc))

    as_of = str(payload.get("as_of") or "unknown")
    prices = {
        str(symbol): Price(symbol=str(symbol), last=float(value), tier="snapshot", as_of=as_of)
        for symbol, value in (payload.get("prices") or {}).items()
        if isinstance(value, (int, float))
    }
    age = _age_in_days(as_of)
    detail = f"last close {as_of}" + (f", {age} day(s) old" if age else "")
    return prices, SourceStatus("price snapshot", "stale", detail)


def fetch_live(symbols_to_tickers: dict[str, str]) -> tuple[dict[str, Price], SourceStatus]:
    """Try Yahoo for every holding. Returns whatever it got plus a status."""
    yahoo = YahooClient()
    prices: dict[str, Price] = {}
    missing: list[str] = []
    unreachable = ""
    today = date.today().isoformat()

    for symbol, ticker in symbols_to_tickers.items():
        try:
            quote = yahoo.quote(ticker)
        except SourceUnavailable as exc:
            unreachable = exc.detail
            break
        if quote is None or quote.last_price is None:
            missing.append(symbol)
            continue
        prices[symbol] = Price(
            symbol=symbol, last=quote.last_price, tier="live", as_of=today,
            prev_close=quote.previous_close,
        )

    if unreachable:
        return prices, SourceStatus(
            "yahoo (live prices)", "failed", f"unreachable, {unreachable}"
        )
    detail = f"{len(prices)} of {len(symbols_to_tickers)} quoted"
    if missing:
        detail += f"; no quote for {', '.join(missing[:5])}"
    return prices, SourceStatus("yahoo (live prices)", "ok" if prices else "failed", detail)


def fetch_bars(
    tickers: dict[str, str], *, period: str = "1y", client: YahooClient | None = None
) -> tuple[dict[str, list[Bar]], SourceStatus]:
    """Daily history per symbol, for the levels engine."""
    client = client or YahooClient()
    bars: dict[str, list[Bar]] = {}
    unreachable = ""
    for symbol, ticker in tickers.items():
        try:
            series = client.history(ticker, period=period)
        except SourceUnavailable as exc:
            unreachable = exc.detail
            break
        if series:
            bars[symbol] = series
    if unreachable:
        return bars, SourceStatus("yahoo (history)", "failed", f"unreachable, {unreachable}")
    return bars, SourceStatus(
        "yahoo (history)", "ok" if bars else "failed",
        f"{len(bars)} of {len(tickers)} series",
    )


def fetch_global_cues(client: YahooClient | None = None) -> tuple[list[dict[str, Any]], SourceStatus]:
    """Overnight cues: US, Asia, crude, gold, the rupee, US 10-year."""
    client = client or YahooClient()
    rows: list[dict[str, Any]] = []
    for name, ticker in GLOBAL_CUES.items():
        try:
            quote = client.quote(ticker)
        except SourceUnavailable as exc:
            return rows, SourceStatus("global cues", "failed", f"unreachable, {exc.detail}")
        if quote is None or quote.last_price is None:
            continue
        change = None
        if quote.previous_close:
            change = (quote.last_price / quote.previous_close - 1) * 100
        rows.append({
            "name": name,
            "last": round(quote.last_price, 2),
            "change_pct": round(change, 2) if change is not None else None,
        })
    return rows, SourceStatus("global cues", "ok" if rows else "failed", f"{len(rows)} markets")


def collect(
    symbols_to_tickers: dict[str, str],
    *,
    offline: bool = False,
    snapshot_path: Path | None = None,
) -> MarketData:
    """Live prices where possible, snapshot underneath, status for both."""
    data = MarketData(fetched_at=datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"))

    snapshot_prices, snapshot_status = load_snapshot(snapshot_path)

    if offline:
        data.statuses.append(
            SourceStatus("yahoo (live prices)", "skipped", "run without --offline to fetch",
                         label_override="not fetched")
        )
    else:
        live_prices, live_status = fetch_live(symbols_to_tickers)
        data.statuses.append(live_status)
        data.prices.update(live_prices)

    # Snapshot fills only what live could not supply, so a half-finished live
    # fetch never silently mixes into a row that already has a fresh price.
    for symbol, price in snapshot_prices.items():
        data.prices.setdefault(symbol, price)
    if snapshot_prices:
        used = sum(1 for p in data.prices.values() if p.tier == "snapshot")
        snapshot_status.detail += f"; {used} row(s) rely on it"
    data.statuses.append(snapshot_status)

    return data


def _age_in_days(as_of: str) -> int | None:
    try:
        return (date.today() - date.fromisoformat(as_of)).days
    except ValueError:
        return None
