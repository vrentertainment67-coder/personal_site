"""Portfolio analytics. Every figure on the dashboard is computed here.

The rules that matter:

* No cost basis (`avg_cost: null`) means no unrealised P/L and no return %.
  Treating a missing cost as zero turns the whole position into "profit", which
  is what the v0 dashboard did; the row still contributes value and weight.
* An unpriced row contributes nothing to value, and the weights say so.
* Nothing is inferred. A number that cannot be computed stays None and the
  dashboard prints an em dash.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from .holdings import Holding, Portfolio
from .market import MarketData, Price


@dataclass(frozen=True)
class Position:
    holding: Holding
    price: Price | None

    @property
    def name(self) -> str:
        return self.holding.name

    @property
    def symbol(self) -> str | None:
        return self.holding.nse_symbol

    @property
    def sector(self) -> str:
        return self.holding.sector

    @property
    def qty(self) -> float:
        return self.holding.qty

    @property
    def avg_cost(self) -> float | None:
        return self.holding.avg_cost

    @property
    def invested(self) -> float | None:
        return self.holding.invested

    @property
    def last(self) -> float | None:
        return self.price.last if self.price else None

    @property
    def value(self) -> float | None:
        if self.price is None:
            return None
        return self.qty * self.price.last

    @property
    def unrealised(self) -> float | None:
        """None when either the price or the cost basis is missing."""
        value, invested = self.value, self.invested
        if value is None or invested is None:
            return None
        return value - invested

    @property
    def return_pct(self) -> float | None:
        if self.price is None or self.avg_cost in (None, 0):
            return None
        return (self.price.last / self.avg_cost - 1) * 100

    @property
    def day_change_value(self) -> float | None:
        if self.price is None or self.price.day_change is None:
            return None
        return self.qty * self.price.day_change

    @property
    def day_change_pct(self) -> float | None:
        return self.price.day_change_pct if self.price else None

    @property
    def realized(self) -> float | None:
        return self.holding.realized_pl

    @property
    def price_tier(self) -> str:
        return self.price.tier if self.price else "none"


@dataclass(frozen=True)
class SectorSlice:
    name: str
    value: float
    weight_pct: float
    count: int


@dataclass(frozen=True)
class Concentration:
    top3_names: list[str]
    top3_value: float
    top3_pct: float
    top5_names: list[str]
    top5_value: float
    top5_pct: float

    @property
    def top3_drawdown_10pct(self) -> float:
        """"A 10% fall in the top 3 costs this much."" """
        return self.top3_value * 0.10


@dataclass
class Analytics:
    positions: list[Position]
    total_value: float
    invested_with_cost: float
    unrealised: float | None
    realised: float
    priced_count: int
    unpriced: list[Position]
    no_cost_basis: list[Position]
    in_profit: int
    measurable: int
    sectors: list[SectorSlice]
    concentration: Concentration | None
    day_change_value: float | None

    def weight_pct(self, position: Position) -> float | None:
        value = position.value
        if value is None or not self.total_value:
            return None
        return value / self.total_value * 100

    @property
    def unrealised_pct(self) -> float | None:
        if self.unrealised is None or not self.invested_with_cost:
            return None
        return self.unrealised / self.invested_with_cost * 100

    @property
    def losers(self) -> list[Position]:
        """Positions down more than 20%, worst first."""
        rows = [p for p in self.positions if (p.return_pct or 0) < -20]
        return sorted(rows, key=lambda p: p.return_pct or 0)

    @property
    def gainers_by_pct(self) -> list[Position]:
        rows = [p for p in self.positions if p.return_pct is not None]
        return sorted(rows, key=lambda p: p.return_pct or 0, reverse=True)


def build_positions(portfolio: Portfolio, market: MarketData) -> list[Position]:
    return [Position(holding=h, price=market.get(h.nse_symbol)) for h in portfolio]


def analyse(portfolio: Portfolio, market: MarketData) -> Analytics:
    positions = build_positions(portfolio, market)
    priced = [p for p in positions if p.value is not None]
    total_value = sum(p.value or 0.0 for p in priced)

    with_cost = [p for p in priced if p.invested is not None]
    invested_with_cost = sum(p.invested or 0.0 for p in with_cost)
    unrealised = sum(p.unrealised or 0.0 for p in with_cost) if with_cost else None

    day_changes = [p.day_change_value for p in priced if p.day_change_value is not None]
    day_change_value = sum(day_changes) if day_changes else None

    return Analytics(
        positions=positions,
        total_value=total_value,
        invested_with_cost=invested_with_cost,
        unrealised=unrealised,
        realised=sum(p.realized or 0.0 for p in positions),
        priced_count=len(priced),
        unpriced=[p for p in positions if p.value is None],
        no_cost_basis=[p for p in positions if p.avg_cost is None],
        in_profit=sum(1 for p in with_cost if (p.unrealised or 0) > 0),
        measurable=len(with_cost),
        sectors=_sectors(priced, total_value),
        concentration=_concentration(priced, total_value),
        day_change_value=day_change_value,
    )


def _sectors(priced: Iterable[Position], total: float) -> list[SectorSlice]:
    buckets: dict[str, list[Position]] = {}
    for position in priced:
        buckets.setdefault(position.sector, []).append(position)
    slices = [
        SectorSlice(
            name=name,
            value=sum(p.value or 0.0 for p in rows),
            weight_pct=(sum(p.value or 0.0 for p in rows) / total * 100) if total else 0.0,
            count=len(rows),
        )
        for name, rows in buckets.items()
    ]
    return sorted(slices, key=lambda s: s.value, reverse=True)


def _concentration(priced: list[Position], total: float) -> Concentration | None:
    if not priced or not total:
        return None
    ranked = sorted(priced, key=lambda p: p.value or 0.0, reverse=True)
    top3, top5 = ranked[:3], ranked[:5]
    v3 = sum(p.value or 0.0 for p in top3)
    v5 = sum(p.value or 0.0 for p in top5)
    return Concentration(
        top3_names=[p.name for p in top3],
        top3_value=v3,
        top3_pct=v3 / total * 100,
        top5_names=[p.name for p in top5],
        top5_value=v5,
        top5_pct=v5 / total * 100,
    )
