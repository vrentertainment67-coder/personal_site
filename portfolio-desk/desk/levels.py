"""Price levels, computed from daily bars. No network, no opinions.

Everything here is arithmetic on OHLC: classic pivots, CPR, moving averages,
the 52-week range, previous day/week extremes and fractal swings. The levels
are then clustered into zones, so "1,240 showed up as yesterday's low, the
50-DMA and S1" becomes one zone with three methods behind it instead of three
lines on a chart.
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Iterable, Sequence

# How close two levels must be to count as the same zone.
INDEX_TOLERANCE_PCT = 0.3
STOCK_TOLERANCE_PCT = 0.75

SWING_LOOKBACK = 60
SWING_STRENGTH = 2

# A "resistance 0.0% above" is the pivot landing on the close — true, and
# useless. The nearest zones must be far enough away to be ahead of price.
INDEX_MIN_DISTANCE_PCT = 0.25
STOCK_MIN_DISTANCE_PCT = 0.75


@dataclass(frozen=True)
class Bar:
    day: date
    open: float
    high: float
    low: float
    close: float
    volume: float | None = None


@dataclass(frozen=True)
class Level:
    price: float
    method: str
    kind: str  # "support", "resistance" or "pivot" — before price is known

    def with_side(self, last_price: float) -> "Level":
        side = "support" if self.price < last_price else "resistance"
        return Level(price=self.price, method=self.method, kind=side)


@dataclass(frozen=True)
class Pivots:
    p: float
    r1: float
    r2: float
    r3: float
    s1: float
    s2: float
    s3: float


@dataclass(frozen=True)
class CPR:
    tc: float
    p: float
    bc: float

    @property
    def width_pct(self) -> float:
        return abs(self.tc - self.bc) / self.p * 100 if self.p else 0.0

    @property
    def shape(self) -> str:
        """A narrow CPR tends to precede a trending day, a wide one a range."""
        width = self.width_pct
        if width < 0.2:
            return "narrow"
        if width > 0.5:
            return "wide"
        return "average"


# Pivots, CPR and the S/R ladder are one calculation, so a zone holding
# "pivot, CPR top, CPR bottom" is one method agreeing with itself, not three.
# Agreement is counted in families for exactly that reason.
METHOD_FAMILIES = {
    "pivot": "pivots", "R1": "pivots", "R2": "pivots", "R3": "pivots",
    "S1": "pivots", "S2": "pivots", "S3": "pivots",
    "CPR top": "pivots", "CPR bottom": "pivots",
    "20 DMA": "moving averages", "50 DMA": "moving averages", "200 DMA": "moving averages",
    "52w high": "52-week range", "52w low": "52-week range",
    "prev day high": "previous day", "prev day low": "previous day",
    "prev week high": "previous week", "prev week low": "previous week",
    "swing high": "swings", "swing low": "swings",
    "highest call OI": "option interest", "highest put OI": "option interest",
    "max pain": "option interest",
}


@dataclass(frozen=True)
class Zone:
    low: float
    high: float
    center: float
    methods: tuple[str, ...]
    side: str

    @property
    def families(self) -> tuple[str, ...]:
        return tuple(
            dict.fromkeys(METHOD_FAMILIES.get(m, m) for m in self.methods)
        )

    @property
    def strength(self) -> int:
        """How many independent methods agree — counted by family."""
        return len(self.families)

    def label(self) -> str:
        """What agrees here, by family — the unit `strength` counts."""
        return ", ".join(self.families)

    def distance_pct(self, price: float) -> float:
        return (self.center - price) / price * 100 if price else 0.0

    def contains(self, price: float) -> bool:
        return self.low <= price <= self.high


@dataclass
class LevelSet:
    """Everything computed for one instrument."""

    symbol: str
    last: float
    prev_close: float | None = None
    pivots: Pivots | None = None
    cpr: CPR | None = None
    dma: dict[int, float] = field(default_factory=dict)
    week_52_high: float | None = None
    week_52_low: float | None = None
    prev_day_high: float | None = None
    prev_day_low: float | None = None
    prev_week_high: float | None = None
    prev_week_low: float | None = None
    swing_highs: list[float] = field(default_factory=list)
    swing_lows: list[float] = field(default_factory=list)
    min_distance_pct: float = STOCK_MIN_DISTANCE_PCT
    oi_support: float | None = None
    oi_resistance: float | None = None
    pcr: float | None = None
    max_pain: float | None = None
    zones: list[Zone] = field(default_factory=list)

    @property
    def day_change_pct(self) -> float | None:
        if not self.prev_close:
            return None
        return (self.last / self.prev_close - 1) * 100

    def dma_gap_pct(self, period: int) -> float | None:
        value = self.dma.get(period)
        if not value:
            return None
        return (self.last / value - 1) * 100

    def from_52w_high_pct(self) -> float | None:
        if not self.week_52_high:
            return None
        return (self.last / self.week_52_high - 1) * 100

    def from_52w_low_pct(self) -> float | None:
        if not self.week_52_low:
            return None
        return (self.last / self.week_52_low - 1) * 100

    def _far_enough(self, zone: Zone) -> bool:
        return abs(zone.distance_pct(self.last)) >= self.min_distance_pct

    def supports(self, limit: int = 3, *, all_zones: bool = False) -> list[Zone]:
        rows = [z for z in self.zones if z.side == "support"]
        if not all_zones:
            rows = [z for z in rows if self._far_enough(z)]
        return sorted(rows, key=lambda z: self.last - z.center)[:limit]

    def resistances(self, limit: int = 3, *, all_zones: bool = False) -> list[Zone]:
        rows = [z for z in self.zones if z.side == "resistance"]
        if not all_zones:
            rows = [z for z in rows if self._far_enough(z)]
        return sorted(rows, key=lambda z: z.center - self.last)[:limit]

    def nearest_support(self) -> Zone | None:
        rows = self.supports(1)
        return rows[0] if rows else None

    def nearest_resistance(self) -> Zone | None:
        rows = self.resistances(1)
        return rows[0] if rows else None


# ----------------------------------------------------------------- primitives


def classic_pivots(high: float, low: float, close: float) -> Pivots:
    p = (high + low + close) / 3
    span = high - low
    return Pivots(
        p=p,
        r1=2 * p - low,
        s1=2 * p - high,
        r2=p + span,
        s2=p - span,
        r3=high + 2 * (p - low),
        s3=low - 2 * (high - p),
    )


def central_pivot_range(high: float, low: float, close: float) -> CPR:
    p = (high + low + close) / 3
    bc = (high + low) / 2
    tc = 2 * p - bc
    # TC is the upper edge by definition, whichever way the arithmetic lands.
    return CPR(tc=max(tc, bc), p=p, bc=min(tc, bc))


def sma(values: Sequence[float], period: int) -> float | None:
    if len(values) < period:
        return None
    return sum(values[-period:]) / period


def swing_points(
    bars: Sequence[Bar], *, strength: int = SWING_STRENGTH, lookback: int = SWING_LOOKBACK
) -> tuple[list[float], list[float]]:
    """Fractal swings: a high with `strength` lower highs on each side, and vice versa."""
    window = list(bars[-lookback:]) if lookback else list(bars)
    highs: list[float] = []
    lows: list[float] = []
    for i in range(strength, len(window) - strength):
        bar = window[i]
        left = window[i - strength : i]
        right = window[i + 1 : i + 1 + strength]
        if all(bar.high > b.high for b in left) and all(bar.high > b.high for b in right):
            highs.append(bar.high)
        if all(bar.low < b.low for b in left) and all(bar.low < b.low for b in right):
            lows.append(bar.low)
    return highs, lows


def previous_week_range(bars: Sequence[Bar], *, today: date | None = None) -> tuple[float, float] | None:
    """High and low of the last completed calendar week."""
    if not bars:
        return None
    today = today or bars[-1].day
    this_monday = today - timedelta(days=today.weekday())
    last_monday = this_monday - timedelta(days=7)
    week = [b for b in bars if last_monday <= b.day < this_monday]
    if not week:
        return None
    return max(b.high for b in week), min(b.low for b in week)


def cluster(levels: Iterable[Level], *, last_price: float, tolerance_pct: float) -> list[Zone]:
    """Group levels that sit within `tolerance_pct` of each other into zones."""
    ordered = sorted((lv for lv in levels if lv.price > 0), key=lambda lv: lv.price)
    if not ordered:
        return []

    zones: list[Zone] = []
    bucket: list[Level] = [ordered[0]]

    def flush(rows: list[Level]) -> None:
        prices = [r.price for r in rows]
        center = statistics.fmean(prices)
        methods = tuple(dict.fromkeys(r.method for r in rows))
        zones.append(
            Zone(
                low=min(prices),
                high=max(prices),
                center=center,
                methods=methods,
                side="support" if center < last_price else "resistance",
            )
        )

    for level in ordered[1:]:
        prices = [r.price for r in bucket]
        center = statistics.fmean(prices)
        near_center = abs(level.price - center) / center * 100 <= tolerance_pct
        # Comparing only against the running mean lets a chain of levels drift:
        # each one is close to the mean it just moved, and the zone ends up
        # several times wider than the tolerance. Cap the width too.
        width_pct = (max(prices + [level.price]) - min(prices + [level.price])) / center * 100
        if near_center and width_pct <= tolerance_pct:
            bucket.append(level)
        else:
            flush(bucket)
            bucket = [level]
    flush(bucket)
    return zones


# -------------------------------------------------------------------- builder


def previous_session(bars: Sequence[Bar], *, today: date | None = None) -> int:
    """Index of the last *completed* session.

    Yahoo's daily history includes today's bar once the market opens, and at
    08:30 it ends at yesterday. Pivots are computed from the completed session,
    so this has to be the bar before today's — never today's own partial bar.
    """
    today = today or date.today()
    for i in range(len(bars) - 1, -1, -1):
        if bars[i].day < today:
            return i
    return max(len(bars) - 2, 0)


def build(
    symbol: str,
    bars: Sequence[Bar],
    *,
    last: float | None = None,
    prev_close: float | None = None,
    today: date | None = None,
    is_index: bool = False,
    oi_support: float | None = None,
    oi_resistance: float | None = None,
    pcr: float | None = None,
    max_pain: float | None = None,
) -> LevelSet:
    """Compute every level for one instrument from its daily bars.

    `bars` must be in ascending date order and end with the most recent
    completed session. `last` defaults to that session's close.
    """
    if not bars:
        raise ValueError(f"{symbol}: no bars")

    closes = [b.close for b in bars]
    index = previous_session(bars, today=today)
    previous = bars[index]
    last_price = last if last is not None else previous.close

    # The close to measure the day's move against. The quote's own previous
    # close wins when we have it; otherwise it is the session before whichever
    # one `last` belongs to — comparing a close against itself would report
    # every instrument as unchanged.
    if prev_close is None:
        if last is not None and abs(last - previous.close) > 1e-9:
            prev_close = previous.close
        elif index >= 1:
            prev_close = bars[index - 1].close

    level_set = LevelSet(
        symbol=symbol,
        last=last_price,
        min_distance_pct=INDEX_MIN_DISTANCE_PCT if is_index else STOCK_MIN_DISTANCE_PCT,
        prev_close=prev_close,
        pivots=classic_pivots(previous.high, previous.low, previous.close),
        cpr=central_pivot_range(previous.high, previous.low, previous.close),
        prev_day_high=previous.high,
        prev_day_low=previous.low,
        oi_support=oi_support,
        oi_resistance=oi_resistance,
        pcr=pcr,
        max_pain=max_pain,
    )

    for period in (20, 50, 200):
        value = sma(closes, period)
        if value is not None:
            level_set.dma[period] = value

    year = bars[-252:] if len(bars) >= 252 else list(bars)
    level_set.week_52_high = max(b.high for b in year)
    level_set.week_52_low = min(b.low for b in year)

    last_week = previous_week_range(bars)
    if last_week:
        level_set.prev_week_high, level_set.prev_week_low = last_week

    level_set.swing_highs, level_set.swing_lows = swing_points(bars)

    tolerance = INDEX_TOLERANCE_PCT if is_index else STOCK_TOLERANCE_PCT
    level_set.zones = cluster(
        _candidate_levels(level_set), last_price=last_price, tolerance_pct=tolerance
    )
    return level_set


def _candidate_levels(ls: LevelSet) -> list[Level]:
    out: list[Level] = []

    def add(price: float | None, method: str) -> None:
        if price and price > 0:
            out.append(Level(price=price, method=method, kind="pivot"))

    if ls.pivots:
        add(ls.pivots.r1, "R1")
        add(ls.pivots.r2, "R2")
        add(ls.pivots.r3, "R3")
        add(ls.pivots.s1, "S1")
        add(ls.pivots.s2, "S2")
        add(ls.pivots.s3, "S3")
        add(ls.pivots.p, "pivot")
    if ls.cpr:
        add(ls.cpr.tc, "CPR top")
        add(ls.cpr.bc, "CPR bottom")
    for period, value in ls.dma.items():
        add(value, f"{period} DMA")
    add(ls.week_52_high, "52w high")
    add(ls.week_52_low, "52w low")
    add(ls.prev_day_high, "prev day high")
    add(ls.prev_day_low, "prev day low")
    add(ls.prev_week_high, "prev week high")
    add(ls.prev_week_low, "prev week low")
    for price in ls.swing_highs:
        add(price, "swing high")
    for price in ls.swing_lows:
        add(price, "swing low")
    add(ls.oi_resistance, "highest call OI")
    add(ls.oi_support, "highest put OI")
    add(ls.max_pain, "max pain")
    return out
