"""Geometry for the page's charts. Pure functions, no drawing.

Every chart is laid out here and rendered as inline SVG by the template, so the
page stays a single file with no chart library and no CDN.

One design rule runs through all of it: **the verdict is never carried by colour
alone.** Buy green against Sell red measures ΔE 5.2 under deuteranopia on the
dark surface — below the usable floor — so position (which column, which
quadrant), shape (▲ ● ▼) and the written word do the work, and colour only
reinforces what is already legible without it.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence


@dataclass(frozen=True)
class Spark:
    """A sparkline, as a polyline in a 0..width / 0..height box."""

    points: str
    last_x: float
    last_y: float
    rising: bool
    low: float
    high: float


def sparkline(closes: Sequence[float], *, width: float = 72, height: float = 20,
              pad: float = 2) -> Spark | None:
    """A year of closes reduced to one line. None when there is too little."""
    series = [c for c in closes if c and c > 0]
    if len(series) < 5:
        return None
    low, high = min(series), max(series)
    span = high - low or 1.0
    step = (width - pad * 2) / (len(series) - 1)
    inner = height - pad * 2

    coords = [
        (pad + i * step, pad + inner - ((value - low) / span) * inner)
        for i, value in enumerate(series)
    ]
    points = " ".join(f"{x:.1f},{y:.1f}" for x, y in coords)
    return Spark(
        points=points,
        last_x=coords[-1][0],
        last_y=coords[-1][1],
        rising=series[-1] >= series[0],
        low=low,
        high=high,
    )


def range_position(last: float, low: float | None, high: float | None) -> float | None:
    """Where price sits in its 52-week range, 0 at the low and 100 at the high."""
    if low is None or high is None or high <= low:
        return None
    return max(0.0, min(100.0, (last - low) / (high - low) * 100))


@dataclass(frozen=True)
class Dot:
    """One holding on the valuation-against-trend scatter."""

    name: str
    symbol: str
    x: float          # 0..100, left = falling, right = rising
    y: float          # 0..100, bottom = expensive, top = cheap
    verdict: str
    tone: str
    shape: str        # triangle-up / circle / triangle-down — the CVD-safe channel
    size: float       # radius in px, from position weight
    label: bool       # whether to print the name beside it
    title: str

SHAPES = {"Buy": "up", "Keep": "circle", "Sell": "down"}


def scatter(ratings, *, max_labels: int = 6) -> list[Dot]:
    """Trend on x, valuation on y — the two factors that disagree most often.

    A holding appears only when it has both, so the chart never implies a
    valuation the desk does not have.
    """
    rows = []
    for rating in ratings:
        factors = {f.name: f for f in rating.factors}
        if "trend" not in factors or "valuation" not in factors:
            continue
        weight = next(
            (f for f in rating.factors if f.name == "size"), None
        )
        rows.append((rating, factors["trend"].score, factors["valuation"].score, weight))

    if not rows:
        return []

    # Label the names a reader would look for: the extremes of each axis.
    interesting = sorted(
        rows, key=lambda r: -(abs(r[1]) + abs(r[2]))
    )[:max_labels]
    labelled = {id(r[0]) for r in interesting}

    dots = []
    for rating, trend, valuation, _ in rows:
        verdict = rating.verdict.value
        dots.append(
            Dot(
                name=rating.name,
                symbol=rating.position.symbol or "",
                x=(trend + 1) / 2 * 100,
                y=(valuation + 1) / 2 * 100,
                verdict=verdict,
                tone=rating.verdict.tone,
                shape=SHAPES.get(verdict, "circle"),
                size=5.0,
                label=id(rating) in labelled,
                title=(
                    f"{rating.name} — {verdict} ({rating.score:+.2f}); "
                    f"trend {trend:+.2f}, valuation {valuation:+.2f}"
                ),
            )
        )
    return dots


@dataclass(frozen=True)
class Band:
    """How much money sits behind one verdict."""

    verdict: str
    tone: str
    value: float
    share_pct: float
    count: int


def value_by_verdict(ratings, total_value: float) -> list[Band]:
    """The question the three columns do not answer: how much is in each."""
    buckets: dict[str, list] = {"Buy": [], "Keep": [], "Sell": [], "No rating": []}
    for rating in ratings:
        buckets.setdefault(rating.verdict.value, []).append(rating)

    tones = {"Buy": "good", "Keep": "neutral", "Sell": "bad", "No rating": "warn"}
    bands = []
    for verdict in ("Buy", "Keep", "Sell", "No rating"):
        rows = buckets.get(verdict) or []
        if not rows:
            continue
        value = sum(r.position.value or 0.0 for r in rows)
        bands.append(
            Band(
                verdict=verdict,
                tone=tones[verdict],
                value=value,
                share_pct=(value / total_value * 100) if total_value else 0.0,
                count=len(rows),
            )
        )
    return bands
