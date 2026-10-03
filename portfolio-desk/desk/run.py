"""The morning run: data in, dashboard and brief out.

Order matters. Prices and history first, then levels, then the signals that
read those levels, then news for the names the signals surfaced, and only then
Claude — which sees nothing but the JSON those steps produced.

Every stage fails soft and records why. A dead source removes a section from the
brief and turns a chip red on the dashboard; it never aborts the run and never
silently substitutes stale data for fresh.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any

from . import brief as brief_mod
from . import config, dashboard, levels as levels_mod, market as market_mod, signals as signals_mod
from . import ratings as ratings_mod
from . import trading_days
from .holdings import Portfolio, load as load_holdings
from .market import MarketData, SourceStatus
from .portfolio import Analytics, analyse
from .sources.http import SourceUnavailable
from .sources.fundamentals import FundamentalsClient
from .sources.news import NewsClient
from .sources.nse_client import NseClient
from .sources.yahoo import YahooClient
from . import oi as oi_mod
from . import relative as relative_mod

log = logging.getLogger(__name__)

# Only these two have a liquid enough index chain to be worth the OI levels.
OPTION_CHAIN_INDICES = {"NIFTY 50": "NIFTY", "BANK NIFTY": "BANKNIFTY"}
# News costs one request per name; fetch it for the names that already matter.
NEWS_LIMIT = 12


@dataclass
class RunResult:
    day: date
    traded: bool
    reason: str = ""
    portfolio: Portfolio | None = None
    analytics: Analytics | None = None
    market: MarketData | None = None
    levels: dict[str, levels_mod.LevelSet] = field(default_factory=dict)
    watchlist: list[signals_mod.Attention] = field(default_factory=list)
    ratings: list[ratings_mod.Rating] = field(default_factory=list)
    closes: dict[str, list[float]] = field(default_factory=dict)
    fundamentals: dict[str, Any] = field(default_factory=dict)
    relatives: dict[str, Any] = field(default_factory=dict)
    portfolio_signals: list[signals_mod.PortfolioSignal] = field(default_factory=list)
    news: dict[str, list[dict[str, Any]]] = field(default_factory=dict)
    globals_: list[dict[str, Any]] = field(default_factory=list)
    vix: float | None = None
    fii_dii: list[dict[str, Any]] = field(default_factory=list)
    brief: brief_mod.BriefResult | None = None
    dashboard_path: Path | None = None
    unavailable: list[str] = field(default_factory=list)

    @property
    def statuses(self) -> list[SourceStatus]:
        return self.market.statuses if self.market else []


def morning(
    *,
    offline: bool = False,
    skip_brief: bool = False,
    force: bool = False,
    holdings_path: Path | None = None,
) -> RunResult:
    today = date.today()
    day = trading_days.status(today)
    if not day.is_open and not force:
        return RunResult(day=today, traded=False, reason=day.reason)

    config.ensure_dirs()
    portfolio = load_holdings(holdings_path)
    result = RunResult(day=today, traded=True, reason=day.reason, portfolio=portfolio)

    yahoo = None if offline else YahooClient()
    nse = None if offline else NseClient()

    # 1. Prices -------------------------------------------------------------
    tickers = {
        h.nse_symbol: h.yahoo_ticker
        for h in portfolio.listed
        if h.nse_symbol and h.yahoo_ticker
    }
    market = market_mod.collect(tickers, offline=offline)
    result.market = market
    result.analytics = analyse(portfolio, market)

    # 2. History and levels -------------------------------------------------
    if yahoo is not None:
        bars, status = market_mod.fetch_bars(tickers, client=yahoo)
        market.statuses.insert(1, status)
        for symbol, series in bars.items():
            self_closes = [b.close for b in series]
            result.closes[symbol] = self_closes
            price = market.get(symbol)
            try:
                result.levels[symbol] = levels_mod.build(
                    symbol, series,
                    last=price.last if price else None,
                    prev_close=price.prev_close if price else None,
                )
            except ValueError:
                continue

        index_bars, index_status = market_mod.fetch_bars(
            market_mod.INDEX_TICKERS, client=yahoo
        )
        market.statuses.insert(2, index_status)
        chains = _option_chains(nse, market) if nse else {}
        for name, series in index_bars.items():
            chain = chains.get(name)
            try:
                result.levels[name] = levels_mod.build(
                    name, series, is_index=True,
                    oi_support=chain.highest_put_oi_strike if chain else None,
                    oi_resistance=chain.highest_call_oi_strike if chain else None,
                    pcr=round(chain.pcr, 2) if chain and chain.pcr else None,
                    max_pain=chain.max_pain if chain else None,
                )
            except ValueError:
                continue

        # Sector indices, so each holding can be judged against its own sector.
        sector_bars, sector_status = market_mod.fetch_bars(
            market_mod.SECTOR_INDEX_TICKERS, client=yahoo
        )
        market.statuses.append(
            SourceStatus("sector indices", sector_status.health, sector_status.detail)
        )
        index_closes = {name: [b.close for b in bars] for name, bars in sector_bars.items()}
        index_closes.update(
            {name: [b.close for b in bars] for name, bars in index_bars.items()}
        )
        for position in result.analytics.positions:
            symbol = position.symbol or ""
            if symbol not in result.closes:
                continue
            comparison = relative_mod.compare(
                symbol, position.sector, result.closes[symbol], index_closes
            )
            if comparison is not None:
                result.relatives[symbol] = comparison

        result.globals_, global_status = market_mod.fetch_global_cues(yahoo)
        market.statuses.append(global_status)

        # Fundamentals: valuation, quality and the next earnings date.
        fundamentals_client = FundamentalsClient()
        fetched, failed = 0, ""
        for symbol, ticker in tickers.items():
            try:
                data = fundamentals_client.fetch(symbol, ticker)
            except SourceUnavailable as exc:
                failed = exc.detail
                break
            if data is not None:
                result.fundamentals[symbol] = data
                fetched += 1
        market.statuses.append(
            SourceStatus(
                "yahoo (fundamentals)",
                "failed" if failed else ("ok" if fetched else "failed"),
                failed or f"{fetched} of {len(tickers)} names",
            )
        )
        if not result.fundamentals:
            result.unavailable.append("valuation and quality")
    else:
        result.unavailable.append("levels (offline run)")

    # 3. NSE extras ---------------------------------------------------------
    if nse is not None:
        try:
            result.vix = nse.india_vix()
            market.statuses.append(SourceStatus("india vix", "ok", f"{result.vix}"))
        except SourceUnavailable as exc:
            market.statuses.append(SourceStatus("india vix", "failed", exc.detail))
            result.unavailable.append("India VIX")
        try:
            result.fii_dii = nse.fii_dii()
            market.statuses.append(SourceStatus("fii/dii", "ok", f"{len(result.fii_dii)} rows"))
        except SourceUnavailable as exc:
            market.statuses.append(SourceStatus("fii/dii", "failed", exc.detail))
            result.unavailable.append("FII/DII flows")

    # 4. Signals and ratings -------------------------------------------------
    result.watchlist = signals_mod.rank(result.analytics, result.levels)
    result.portfolio_signals = signals_mod.portfolio_signals(result.analytics)
    result.ratings = ratings_mod.rate_all(
        result.analytics, result.levels, result.closes,
        result.fundamentals, result.relatives,
    )

    # 5. News, for the names the signals already surfaced -------------------
    if not offline:
        result.news = _news_for(result.watchlist, result.analytics, market)
        if not result.news:
            result.unavailable.append("news")
        else:
            counts = {sym: len(items) for sym, items in result.news.items()}
            result.watchlist = signals_mod.rank(result.analytics, result.levels, news=counts)
    else:
        result.unavailable.append("news (offline run)")

    # 6. The written brief --------------------------------------------------
    if not skip_brief:
        payload = build_payload(result)
        result.brief = brief_mod.generate(payload)
        market.statuses.append(
            SourceStatus(
                "claude brief",
                "ok" if result.brief.ok else "failed",
                result.brief.failure or f"{result.brief.attempts} attempt(s)",
            )
        )
        if not result.brief.ok:
            result.unavailable.append("written brief")
    else:
        market.statuses.append(SourceStatus("claude brief", "skipped", "--no-brief"))

    # 7. The page, and the day's levels on disk -----------------------------
    if result.levels:
        save_levels(result)
    build = dashboard.build(portfolio, market, result.analytics, run=result)
    result.dashboard_path = build.index_path
    return result


def save_levels(result: RunResult) -> Path:
    """Keep every computed level for the day, so a past brief can be checked."""
    path = config.LEVELS_DIR / f"{result.day.isoformat()}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "as_of": result.day.isoformat(),
        "instruments": {
            symbol: {
                "last": round(ls.last, 2),
                "prev_close": round(ls.prev_close, 2) if ls.prev_close else None,
                "pivots": vars(ls.pivots) if ls.pivots else None,
                "cpr": (
                    {"tc": round(ls.cpr.tc, 2), "p": round(ls.cpr.p, 2),
                     "bc": round(ls.cpr.bc, 2), "width_pct": round(ls.cpr.width_pct, 3),
                     "shape": ls.cpr.shape}
                    if ls.cpr else None
                ),
                "dma": {str(k): round(v, 2) for k, v in ls.dma.items()},
                "week_52_high": ls.week_52_high,
                "week_52_low": ls.week_52_low,
                "pcr": ls.pcr,
                "max_pain": ls.max_pain,
                "zones": [
                    {"low": round(z.low, 2), "high": round(z.high, 2),
                     "center": round(z.center, 2), "side": z.side,
                     "methods": list(z.methods), "agreement": z.strength}
                    for z in ls.zones
                ],
            }
            for symbol, ls in result.levels.items()
        },
    }
    path.write_text(json.dumps(payload, indent=2, default=str) + "\n", encoding="utf-8")
    return path


def _option_chains(nse: NseClient, market: MarketData) -> dict[str, Any]:
    chains: dict[str, Any] = {}
    for name, symbol in OPTION_CHAIN_INDICES.items():
        try:
            rows, expiry = nse.option_chain(symbol, is_index=True)
        except SourceUnavailable as exc:
            market.statuses.append(SourceStatus(f"option chain {symbol}", "failed", exc.detail))
            continue
        if not rows:
            continue
        chains[name] = oi_mod.summarise(rows, expiry=expiry)
        market.statuses.append(
            SourceStatus(f"option chain {symbol}", "ok", f"expiry {expiry}")
        )
    return chains


def _news_for(
    watchlist: list[signals_mod.Attention], analytics: Analytics, market: MarketData
) -> dict[str, list[dict[str, Any]]]:
    """Headlines for the watchlist first, then the largest positions."""
    wanted: list[tuple[str, str]] = []
    seen: set[str] = set()
    for item in watchlist:
        symbol = item.position.symbol
        if symbol and symbol not in seen:
            wanted.append((symbol, item.position.name))
            seen.add(symbol)
    by_weight = sorted(
        (p for p in analytics.positions if p.symbol and p.value),
        key=lambda p: p.value or 0, reverse=True,
    )
    for position in by_weight:
        if position.symbol not in seen and len(wanted) < NEWS_LIMIT:
            wanted.append((position.symbol, position.name))
            seen.add(position.symbol)

    client = NewsClient()
    out: dict[str, list[dict[str, Any]]] = {}
    for symbol, name in wanted[:NEWS_LIMIT]:
        try:
            headlines = client.for_company(name, symbol=symbol)
        except SourceUnavailable as exc:
            market.statuses.append(SourceStatus("news", "failed", exc.detail))
            return out
        if headlines:
            out[symbol] = [h.as_dict() for h in headlines]
    market.statuses.append(
        SourceStatus("news", "ok", f"{sum(len(v) for v in out.values())} headlines")
    )
    return out


def build_payload(result: RunResult) -> dict[str, Any]:
    """Exactly what Claude is allowed to see. Every figure is already rounded."""
    analytics = result.analytics
    assert analytics is not None

    indices = []
    for name, ls in result.levels.items():
        if name not in market_mod.INDEX_TICKERS:
            continue
        indices.append({
            "name": name,
            "last": round(ls.last, 2),
            "day_change_pct": round(ls.day_change_pct, 2) if ls.day_change_pct else None,
            "supports": [_zone(z, ls.last) for z in ls.supports(2)],
            "resistances": [_zone(z, ls.last) for z in ls.resistances(2)],
            "cpr_width_pct": round(ls.cpr.width_pct, 2) if ls.cpr else None,
            "cpr_shape": ls.cpr.shape if ls.cpr else None,
            "pcr": ls.pcr,
            "max_pain": ls.max_pain,
        })

    watchlist = []
    for item in result.watchlist:
        position = item.position
        watchlist.append({
            "name": position.name,
            "symbol": position.symbol,
            "last": round(position.last, 2) if position.last else None,
            "weight_pct": round(item.weight_pct, 2) if item.weight_pct else None,
            "day_change_pct": (
                round(position.day_change_pct, 2) if position.day_change_pct else None
            ),
            "reasons": item.reasons,
        })

    return brief_mod.build_payload(
        as_of=result.day,
        market={
            "india_vix": result.vix,
            "global_cues": result.globals_,
            "fii_dii": result.fii_dii[:2],
        },
        indices=indices,
        portfolio_summary={
            "value": round(analytics.total_value, 2),
            "unrealised": round(analytics.unrealised, 2) if analytics.unrealised else None,
            "unrealised_pct": (
                round(analytics.unrealised_pct, 2) if analytics.unrealised_pct else None
            ),
            "holdings": len(analytics.positions),
            "priced": analytics.priced_count,
            "top3_pct": (
                round(analytics.concentration.top3_pct, 1) if analytics.concentration else None
            ),
            "notes": [s.headline + " — " + s.detail for s in result.portfolio_signals],
        },
        watchlist=watchlist,
        ratings=[
            {
                "name": r.name,
                "symbol": r.position.symbol,
                "verdict": r.verdict.value,
                "score": round(r.score, 2),
                "confidence": r.confidence,
                "headline": r.headline,
                "reasons": r.reasons,
                "flip_levels": r.flip_levels,
                "caveats": r.caveats,
                "cost_note": r.cost_note,
            }
            for r in result.ratings
            if r.verdict is not ratings_mod.Verdict.NO_RATING
        ],
        sectors=[
            {"name": s.name, "weight_pct": round(s.weight_pct, 1)}
            for s in analytics.sectors[:8]
        ],
        news=[
            {"symbol": symbol, **item}
            for symbol, items in result.news.items()
            for item in items
        ],
        unavailable=result.unavailable,
    )


def _zone(zone: levels_mod.Zone, price: float) -> dict[str, Any]:
    return {
        "center": round(zone.center, 2),
        "low": round(zone.low, 2),
        "high": round(zone.high, 2),
        "distance_pct": round(zone.distance_pct(price), 2),
        "methods": list(zone.methods),
        "agreement": zone.strength,
    }
