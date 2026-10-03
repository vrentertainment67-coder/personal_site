"""A mechanical Buy / Keep / Sell read on each holding.

What this is: a scorecard over things the desk already computed from price
history — trend, momentum, volatility, drawdown from cost, position size and
where price sits against its levels. Each factor has a fixed weight, a stated
threshold and a sentence. The verdict is the sum. Run it twice on the same data
and it gives the same answer.

What this is not: a forecast. There is no price target, no earnings estimate and
no view on any company's business, because the desk has no data that would
support one. The forward-looking part is `flip_levels`: the prices at which this
same scorecard would read differently.

A rating is a starting point for Vic's own judgement, not a recommendation to
act. The page and the message say so.
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass, field
from enum import Enum

from .levels import LevelSet
from .portfolio import Analytics, Position

# Verdict bands, on a score that runs -1 .. +1.
BUY_ABOVE = 0.30
SELL_BELOW = -0.25

# Position size at which concentration starts to weigh on the score, and the
# size at which it caps the verdict regardless of how good the trend looks.
HEAVY_WEIGHT_PCT = 10.0
EXTREME_WEIGHT_PCT = 20.0

# Annualised volatility (from 60 sessions) above which a position is loud enough
# to count against it.
HIGH_VOL_PCT = 45.0


class Verdict(str, Enum):
    BUY = "Buy"
    KEEP = "Keep"
    SELL = "Sell"
    NO_RATING = "No rating"

    @property
    def tone(self) -> str:
        return {"Buy": "good", "Keep": "neutral", "Sell": "bad", "No rating": "warn"}[self.value]


@dataclass(frozen=True)
class Factor:
    name: str
    score: float      # -1 .. +1
    weight: float
    reason: str

    @property
    def contribution(self) -> float:
        return self.score * self.weight


@dataclass
class Rating:
    position: Position
    verdict: Verdict
    score: float
    factors: list[Factor] = field(default_factory=list)
    flip_levels: dict[str, float] = field(default_factory=dict)
    caveats: list[str] = field(default_factory=list)

    @property
    def name(self) -> str:
        return self.position.name

    @property
    def confidence(self) -> str:
        """How much of the scorecard could actually be filled in."""
        filled = sum(f.weight for f in self.factors)
        if filled >= 0.85:
            return "full"
        if filled >= 0.5:
            return "partial"
        return "thin"

    @property
    def reasons(self) -> list[str]:
        return [f.reason for f in sorted(self.factors, key=lambda f: -abs(f.contribution))]


def annualised_vol(levels: LevelSet, closes: list[float] | None = None) -> float | None:
    """Annualised volatility from the last 60 daily returns."""
    if not closes or len(closes) < 30:
        return None
    returns = [
        (closes[i] / closes[i - 1] - 1) for i in range(1, len(closes)) if closes[i - 1]
    ][-60:]
    if len(returns) < 20:
        return None
    return statistics.pstdev(returns) * (252 ** 0.5) * 100


def _trend(levels: LevelSet) -> Factor | None:
    """Where price sits against its 20, 50 and 200 DMA."""
    gaps = {p: levels.dma_gap_pct(p) for p in (20, 50, 200)}
    available = {p: g for p, g in gaps.items() if g is not None}
    if not available:
        return None

    above = [p for p, g in available.items() if g > 0]
    below = [p for p, g in available.items() if g <= 0]
    score = (len(above) - len(below)) / len(available)

    if len(above) == len(available):
        reason = "Above every moving average it has (" + ", ".join(
            f"{p} DMA {available[p]:+.1f}%" for p in sorted(available)
        ) + ")"
    elif len(below) == len(available):
        reason = "Below every moving average it has (" + ", ".join(
            f"{p} DMA {available[p]:+.1f}%" for p in sorted(available)
        ) + ")"
    else:
        reason = "Mixed against its averages: above " + ", ".join(
            f"{p} DMA" for p in sorted(above)
        ) + "; below " + ", ".join(f"{p} DMA" for p in sorted(below))
    return Factor("trend", score, 0.30, reason)


def _momentum(levels: LevelSet) -> Factor | None:
    """Position inside the 52-week range."""
    high, low = levels.week_52_high, levels.week_52_low
    if not high or not low or high <= low:
        return None
    span = (levels.last - low) / (high - low)          # 0 at the low, 1 at the high
    score = max(-1.0, min(1.0, (span - 0.5) * 2))
    from_high = levels.from_52w_high_pct() or 0.0
    reason = (
        f"{span * 100:.0f}% of the way up its 52-week range "
        f"({from_high:+.1f}% from the high at {high:,.0f}, low {low:,.0f})"
    )
    return Factor("momentum", score, 0.20, reason)


def _levels_context(levels: LevelSet) -> Factor | None:
    """Nearer support than resistance, or the other way round."""
    support, resistance = levels.nearest_support(), levels.nearest_resistance()
    if not support or not resistance:
        return None
    to_support = abs(support.distance_pct(levels.last))
    to_resistance = abs(resistance.distance_pct(levels.last))
    total = to_support + to_resistance
    if total <= 0:
        return None
    # Close to support with room above scores positive.
    score = max(-1.0, min(1.0, (to_resistance - to_support) / total * -1))
    reason = (
        f"{to_support:.1f}% above support at {support.center:,.0f} "
        f"({support.strength} agree), {to_resistance:.1f}% below resistance at "
        f"{resistance.center:,.0f} ({resistance.strength} agree)"
    )
    return Factor("levels", score, 0.15, reason)


def _volatility(levels: LevelSet, closes: list[float] | None) -> Factor | None:
    vol = annualised_vol(levels, closes)
    if vol is None:
        return None
    # 20% vol is calm, 45% is loud; map to +0.5 .. -1.
    score = max(-1.0, min(0.5, (HIGH_VOL_PCT - vol) / 50))
    reason = f"Annualised volatility {vol:.0f}% over the last 60 sessions"
    return Factor("volatility", score, 0.10, reason)


def _concentration(position: Position, analytics: Analytics) -> Factor | None:
    weight = analytics.weight_pct(position)
    if weight is None:
        return None
    if weight < HEAVY_WEIGHT_PCT:
        return Factor(
            "size", 0.0, 0.15, f"{weight:.1f}% of the book — not a concentration problem"
        )
    # Above the threshold the score falls away, reaching -1 at twice it.
    score = max(-1.0, -(weight - HEAVY_WEIGHT_PCT) / HEAVY_WEIGHT_PCT)
    return Factor(
        "size", score, 0.15,
        f"{weight:.1f}% of the book — a single position this size drives the whole portfolio",
    )


def _drawdown(position: Position) -> Factor | None:
    ret = position.return_pct
    if ret is None:
        return None
    # Purely informational about the position, not about the stock: a small
    # weight so it colours the reading without driving it.
    score = max(-1.0, min(1.0, ret / 100))
    reason = f"{ret:+.0f}% against an average cost of {position.avg_cost:,.2f}"
    return Factor("your cost", score, 0.10, reason)


def rate(position: Position, levels: LevelSet | None, analytics: Analytics,
         closes: list[float] | None = None) -> Rating:
    """Score one holding. Missing data narrows the scorecard rather than faking it."""
    rating = Rating(position=position, verdict=Verdict.NO_RATING, score=0.0)

    if position.value is None:
        rating.caveats.append("no price, so nothing can be computed")
        return rating
    if levels is None:
        rating.caveats.append("no price history, so trend and momentum are unknown")
        size = _concentration(position, analytics)
        if size:
            rating.factors.append(size)
        return rating
    if position.holding.verify_symbol:
        rating.caveats.append("ticker was never verified — the history may belong to another instrument")
    if position.avg_cost is None:
        rating.caveats.append("no cost basis, so the return column is blank")

    for factor in (
        _trend(levels),
        _momentum(levels),
        _levels_context(levels),
        _volatility(levels, closes),
        _concentration(position, analytics),
        _drawdown(position),
    ):
        if factor is not None:
            rating.factors.append(factor)

    total_weight = sum(f.weight for f in rating.factors)
    if not total_weight:
        rating.caveats.append("not enough data to score")
        return rating

    rating.score = sum(f.contribution for f in rating.factors) / total_weight

    if rating.score >= BUY_ABOVE:
        rating.verdict = Verdict.BUY
    elif rating.score <= SELL_BELOW:
        rating.verdict = Verdict.SELL
    else:
        rating.verdict = Verdict.KEEP

    # A position big enough to decide the portfolio's fate is never a Buy on a
    # trend score, whatever the chart says.
    weight = analytics.weight_pct(position) or 0.0
    if weight >= EXTREME_WEIGHT_PCT and rating.verdict is Verdict.BUY:
        rating.verdict = Verdict.KEEP
        rating.caveats.append(
            f"the scorecard said Buy, but at {weight:.0f}% of the book this is held back to Keep"
        )

    rating.flip_levels = _flip_levels(position, levels, analytics, closes)
    return rating


def _flip_levels(
    position: Position, levels: LevelSet, analytics: Analytics, closes: list[float] | None
) -> dict[str, float]:
    """The prices at which this same scorecard would read differently.

    Found by re-scoring at candidate prices — not predicted, just solved for.
    """
    out: dict[str, float] = {}
    current = levels.last
    if current <= 0:
        return out

    original = levels.last
    try:
        for direction, key in ((1, "to Buy"), (-1, "to Sell")):
            target = None
            for step in range(1, 61):           # up to 30% away, in 0.5% steps
                levels.last = current * (1 + direction * step * 0.005)
                probe = _score_only(position, levels, analytics, closes)
                if direction > 0 and probe >= BUY_ABOVE:
                    target = levels.last
                    break
                if direction < 0 and probe <= SELL_BELOW:
                    target = levels.last
                    break
            if target is not None:
                out[key] = round(target, 2)
    finally:
        levels.last = original
    return out


def _score_only(
    position: Position, levels: LevelSet, analytics: Analytics, closes: list[float] | None
) -> float:
    factors = [
        f for f in (
            _trend(levels), _momentum(levels), _levels_context(levels),
            _volatility(levels, closes), _concentration(position, analytics),
            _drawdown(position),
        ) if f is not None
    ]
    total = sum(f.weight for f in factors)
    return sum(f.contribution for f in factors) / total if total else 0.0


def rate_all(
    analytics: Analytics,
    levels: dict[str, LevelSet],
    closes: dict[str, list[float]] | None = None,
) -> list[Rating]:
    """Every holding, best score first."""
    closes = closes or {}
    out = [
        rate(position, levels.get(position.symbol or ""), analytics,
             closes.get(position.symbol or ""))
        for position in analytics.positions
    ]
    order = {Verdict.BUY: 0, Verdict.KEEP: 1, Verdict.SELL: 2, Verdict.NO_RATING: 3}
    return sorted(out, key=lambda r: (order[r.verdict], -r.score))


def tally(ratings: list[Rating]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for rating in ratings:
        counts[rating.verdict.value] = counts.get(rating.verdict.value, 0) + 1
    return counts
