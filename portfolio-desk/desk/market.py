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
from typing import Literal

from . import config
from .sources.http import SourceUnavailable
from .sources.yahoo import YahooClient

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

    # Sources that belong to later build steps, so the dashboard can show the
    # gaps rather than pretend the panels are empty by choice.
    data.statuses.extend(
        [
            SourceStatus("nse (option chain, VIX, FII/DII)", "skipped", "step 4"),
            SourceStatus("levels engine", "skipped", "step 3"),
            SourceStatus("news (Google News RSS)", "skipped", "step 5"),
            SourceStatus("claude brief", "skipped", "step 6"),
        ]
    )
    return data


def _age_in_days(as_of: str) -> int | None:
    try:
        return (date.today() - date.fromisoformat(as_of)).days
    except ValueError:
        return None
