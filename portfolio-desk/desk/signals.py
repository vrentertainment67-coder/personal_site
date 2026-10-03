"""What deserves a look this morning, and why.

Each rule emits a Signal with a fixed weight and a sentence a human can check
against the numbers. A holding's score is the sum of its signals, nudged by how
much of the portfolio it represents — a 2% move in a 24% position matters more
than the same move in a 0.2% one.

Nothing here decides anything. There is no buy, sell or hold: the output is an
ordered list of things that changed, with the reason attached.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable

from .format import compact
from .levels import LevelSet, Zone
from .portfolio import Analytics, Position

# Proximity thresholds from the brief.
INDEX_NEAR_PCT = 0.2
STOCK_NEAR_PCT = 2.0
# A zone backed by one family (the pivot ladder, say) is only worth a line when
# price is almost on top of it; two or more families earn the full threshold.
# Without this every stock reports five levels every morning and the list stops
# being read.
WEAK_ZONE_FRACTION = 0.4
# Price has to clear the average by this much to count as a crossing; a close
# a hair above its 50 DMA is not an event.
DMA_CROSS_MARGIN_PCT = 0.25
EXTREME_NEAR_PCT = 2.0
BIG_MOVE_PCT = 3.0
# In a stock that has traded in a 3% band all year, "2% from its 52-week high"
# says nothing. Only flag the extremes when the year's range is wide enough to
# mean something.
MIN_52W_RANGE_PCT = 15.0
VOLUME_SPIKE_X = 2.0
DRAWDOWN_PCT = -20.0
HEAVY_WEIGHT_PCT = 5.0

# Weights. Higher means "put this nearer the top of the list".
W = {
    "near_resistance": 3.0,
    "near_support": 3.0,
    "inside_zone": 4.0,
    "at_52w_high": 3.5,
    "at_52w_low": 3.5,
    "dma_cross_up": 3.0,
    "dma_cross_down": 3.0,
    "big_move": 2.5,
    "volume_spike": 2.0,
    "event": 3.0,
    "news": 1.5,
    "deep_drawdown": 1.0,
    "no_cost_basis": 0.5,
    "unverified_ticker": 0.5,
}


@dataclass(frozen=True)
class Signal:
    code: str
    headline: str
    detail: str
    weight: float
    tone: str = "neutral"  # neutral | good | warn | bad

    @property
    def text(self) -> str:
        return f"{self.headline} — {self.detail}" if self.detail else self.headline


@dataclass
class Attention:
    position: Position
    signals: list[Signal] = field(default_factory=list)
    weight_pct: float | None = None

    @property
    def name(self) -> str:
        return self.position.name

    @property
    def score(self) -> float:
        base = sum(s.weight for s in self.signals)
        if not base:
            return 0.0
        # A holding worth 20% of the book carries more consequence than a 0.2% one,
        # but weight alone must never put a quiet stock on the list.
        size_factor = 1 + min((self.weight_pct or 0) / 100, 0.25)
        return base * size_factor

    @property
    def reasons(self) -> list[str]:
        return [s.text for s in sorted(self.signals, key=lambda s: -s.weight)]


def _price(value: float) -> str:
    """Keep the paise under ₹100, where rounding erases the whole move."""
    return f"{value:,.2f}" if abs(value) < 100 else f"{value:,.0f}"


def _join(items: list[str]) -> str:
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + " and " + items[-1]


def _nearest(zones: Iterable[Zone], price: float, threshold_pct: float) -> tuple[Zone, float] | None:
    """The closest zone worth mentioning, or nothing.

    Only one per side: a holding that is near support is near S1, the CPR and
    the pivot all at once, and listing them separately is noise, not signal.
    """
    best: tuple[Zone, float] | None = None
    for zone in zones:
        distance = 0.0 if zone.contains(price) else abs(zone.distance_pct(price))
        allowed = threshold_pct if zone.strength >= 2 else threshold_pct * WEAK_ZONE_FRACTION
        if distance > allowed:
            continue
        if best is None or distance < best[1]:
            best = (zone, distance)
    return best


def level_signals(levels: LevelSet, *, is_index: bool = False) -> list[Signal]:
    """Signals that come from price sitting near a level."""
    signals: list[Signal] = []
    threshold = INDEX_NEAR_PCT if is_index else STOCK_NEAR_PCT
    price = levels.last

    for side, zones in (("resistance", levels.resistances(3)), ("support", levels.supports(3))):
        found = _nearest(zones, price, threshold)
        if not found:
            continue
        zone, distance = found
        agreement = f"{zone.strength} agree" if zone.strength > 1 else "1 method"
        if distance == 0.0:
            signals.append(Signal(
                "inside_zone", f"Trading inside a {side} zone",
                f"{_price(zone.low)}–{_price(zone.high)} · {agreement}: {zone.label()}",
                W["inside_zone"], "warn"))
        else:
            above_below = "below" if side == "resistance" else "above"
            signals.append(Signal(
                f"near_{side}", f"Near {side}",
                f"{distance:.1f}% {above_below} {_price(zone.center)} · {agreement}: {zone.label()}",
                W[f"near_{side}"] + 0.25 * (zone.strength - 1), "warn"))

    range_pct = (
        (levels.week_52_high / levels.week_52_low - 1) * 100
        if levels.week_52_high and levels.week_52_low
        else 0.0
    )
    meaningful_range = range_pct >= MIN_52W_RANGE_PCT

    high_gap = levels.from_52w_high_pct()
    if meaningful_range and high_gap is not None and abs(high_gap) <= EXTREME_NEAR_PCT:
        signals.append(Signal("at_52w_high", "At its 52-week high",
                              f"{abs(high_gap):.1f}% from {_price(levels.week_52_high)}",
                              W["at_52w_high"], "good"))
    low_gap = levels.from_52w_low_pct()
    if meaningful_range and low_gap is not None and abs(low_gap) <= EXTREME_NEAR_PCT:
        signals.append(Signal("at_52w_low", "At its 52-week low",
                              f"{abs(low_gap):.1f}% from {_price(levels.week_52_low)}",
                              W["at_52w_low"], "bad"))

    # One line per direction, however many averages were crossed — a session
    # that clears the 20, 50 and 200 is one event, not three.
    crossed_up: list[int] = []
    crossed_down: list[int] = []
    for period in (20, 50, 200):
        dma = levels.dma.get(period)
        if not dma or levels.prev_close is None:
            continue
        was_above, is_above = levels.prev_close >= dma, price >= dma
        if was_above == is_above:
            continue
        if abs(price - dma) / dma * 100 < DMA_CROSS_MARGIN_PCT:
            continue  # sitting on it, not through it
        (crossed_up if is_above else crossed_down).append(period)

    for periods, code, verb, tone in (
        (crossed_up, "dma_cross_up", "Crossed above", "good"),
        (crossed_down, "dma_cross_down", "Lost", "bad"),
    ):
        if not periods:
            continue
        names = _join([f"{p} DMA" for p in periods])
        values = ", ".join(_price(levels.dma[p]) for p in periods)
        signals.append(Signal(
            code, f"{verb} its {names}",
            f"at {values}, from {_price(levels.prev_close)}",
            W[code] + 0.5 * (len(periods) - 1), tone,
        ))

    change = levels.day_change_pct
    if change is not None and abs(change) >= BIG_MOVE_PCT:
        signals.append(Signal("big_move", f"Moved {change:+.1f}% last session",
                              f"from {_price(levels.prev_close)}", W["big_move"],
                              "good" if change > 0 else "bad"))
    return signals


def position_signals(
    position: Position,
    *,
    news_count: int = 0,
    event: str | None = None,
    volume_ratio: float | None = None,
) -> list[Signal]:
    """Signals that come from the holding itself rather than its chart."""
    signals: list[Signal] = []

    if event:
        signals.append(Signal("event", "Event today", event, W["event"], "warn"))
    if news_count:
        signals.append(Signal("news", f"{news_count} news item{'s' if news_count > 1 else ''} today",
                              "", W["news"]))
    if volume_ratio and volume_ratio >= VOLUME_SPIKE_X:
        signals.append(Signal("volume_spike", f"Volume {volume_ratio:.1f}x its 20-day average",
                              "", W["volume_spike"], "warn"))

    ret = position.return_pct
    if ret is not None and ret <= DRAWDOWN_PCT:
        signals.append(Signal("deep_drawdown", f"Down {ret:.0f}% on cost",
                              "long-standing, not today's news", W["deep_drawdown"], "bad"))
    if position.avg_cost is None and position.value:
        signals.append(Signal("no_cost_basis", "No cost basis",
                              "return and P/L cannot be computed for this row",
                              W["no_cost_basis"], "warn"))
    if position.holding.verify_symbol:
        signals.append(Signal("unverified_ticker", "Ticker never verified",
                              f"{position.holding.yahoo_ticker} was guessed from the company name",
                              W["unverified_ticker"], "warn"))
    return signals


def rank(
    analytics: Analytics,
    levels: dict[str, LevelSet] | None = None,
    *,
    news: dict[str, int] | None = None,
    events: dict[str, str] | None = None,
    volumes: dict[str, float] | None = None,
    limit: int = 8,
) -> list[Attention]:
    """The morning watchlist: holdings with something to say, most first."""
    levels = levels or {}
    news = news or {}
    events = events or {}
    volumes = volumes or {}

    rows: list[Attention] = []
    for position in analytics.positions:
        symbol = position.symbol or ""
        item = Attention(position=position, weight_pct=analytics.weight_pct(position))
        if symbol in levels:
            item.signals.extend(level_signals(levels[symbol]))
        item.signals.extend(
            position_signals(
                position,
                news_count=news.get(symbol, 0),
                event=events.get(symbol),
                volume_ratio=volumes.get(symbol),
            )
        )
        if item.signals:
            rows.append(item)

    rows.sort(key=lambda a: (-a.score, -(a.weight_pct or 0), a.name))
    return rows[:limit]


@dataclass(frozen=True)
class PortfolioSignal:
    headline: str
    detail: str
    tone: str = "neutral"


def portfolio_signals(analytics: Analytics) -> list[PortfolioSignal]:
    """Signals about the shape of the book rather than any one holding."""
    out: list[PortfolioSignal] = []
    conc = analytics.concentration
    if conc and conc.top3_pct >= 40:
        out.append(
            PortfolioSignal(
                f"Top 3 are {conc.top3_pct:.0f}% of the book",
                f"{', '.join(conc.top3_names)}. A 10% fall across them is "
                f"{compact(conc.top3_drawdown_10pct)}.",
                "warn",
            )
        )
    heavy = [
        p for p in analytics.positions
        if (analytics.weight_pct(p) or 0) >= HEAVY_WEIGHT_PCT
    ]
    if heavy:
        names = ", ".join(f"{p.name} {analytics.weight_pct(p):.0f}%" for p in heavy)
        out.append(PortfolioSignal(f"{len(heavy)} positions above {HEAVY_WEIGHT_PCT:.0f}%", names))

    if analytics.sectors:
        top_sector = analytics.sectors[0]
        if top_sector.weight_pct >= 25:
            out.append(
                PortfolioSignal(
                    f"{top_sector.name} is {top_sector.weight_pct:.0f}% of the book",
                    f"{top_sector.count} holding{'s' if top_sector.count != 1 else ''}.",
                    "warn",
                )
            )
    if analytics.unpriced:
        out.append(
            PortfolioSignal(
                f"{len(analytics.unpriced)} holdings have no price",
                ", ".join(p.name for p in analytics.unpriced) + " — excluded from every total.",
                "warn",
            )
        )
    return out
