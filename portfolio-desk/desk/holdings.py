"""Load, validate and edit holdings.json.

holdings.json is maintained by hand, so the loader is strict about structure and
loud about the things that need a human: missing cost basis, guessed tickers,
rows that were transcribed from a screenshot and may be incomplete.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any, Iterable, Iterator

from . import config

# Tickers that were guessed from a company name are listed in CLAUDE.md as
# known doubts; holdings.json carries the flag per row (`verify_symbol`).
REQUIRED_FIELDS = (
    "name",
    "nse_symbol",
    "yahoo_ticker",
    "sector",
    "qty",
    "avg_cost",
    "realized_pl",
    "verify_symbol",
    "notes",
)


class HoldingsError(ValueError):
    """holdings.json is malformed in a way that must be fixed by hand."""


@dataclass(frozen=True)
class Holding:
    name: str
    nse_symbol: str | None
    yahoo_ticker: str | None
    sector: str
    qty: float
    avg_cost: float | None
    realized_pl: float | None
    verify_symbol: bool
    notes: str | None

    @property
    def is_listed(self) -> bool:
        """Unlisted rows (nse_symbol null) count in the portfolio but are never fetched."""
        return self.nse_symbol is not None and self.yahoo_ticker is not None

    @property
    def has_cost_basis(self) -> bool:
        return self.avg_cost is not None

    @property
    def invested(self) -> float | None:
        """Cost of the position, or None when the cost basis is missing."""
        if self.avg_cost is None:
            return None
        return self.qty * self.avg_cost

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "nse_symbol": self.nse_symbol,
            "yahoo_ticker": self.yahoo_ticker,
            "sector": self.sector,
            "qty": self.qty,
            "avg_cost": self.avg_cost,
            "realized_pl": self.realized_pl,
            "verify_symbol": self.verify_symbol,
            "notes": self.notes,
        }


@dataclass(frozen=True)
class Portfolio:
    as_of: str
    source: str
    holdings: tuple[Holding, ...]
    path: Path

    def __iter__(self) -> Iterator[Holding]:
        return iter(self.holdings)

    def __len__(self) -> int:
        return len(self.holdings)

    @property
    def listed(self) -> tuple[Holding, ...]:
        return tuple(h for h in self.holdings if h.is_listed)

    @property
    def unlisted(self) -> tuple[Holding, ...]:
        return tuple(h for h in self.holdings if not h.is_listed)

    @property
    def needs_symbol_check(self) -> tuple[Holding, ...]:
        return tuple(h for h in self.holdings if h.verify_symbol and h.is_listed)

    @property
    def missing_cost_basis(self) -> tuple[Holding, ...]:
        """The "fix cost basis" list: value and price moves shown, no return %."""
        return tuple(h for h in self.holdings if not h.has_cost_basis)

    @property
    def incomplete(self) -> tuple[Holding, ...]:
        """Rows with a field that was never captured from the broker app."""
        return tuple(h for h in self.holdings if h.realized_pl is None)

    def by_name(self, name: str) -> Holding | None:
        wanted = name.strip().casefold()
        for holding in self.holdings:
            if holding.name.casefold() == wanted:
                return holding
        return None

    def by_symbol(self, symbol: str) -> Holding | None:
        wanted = symbol.strip().upper()
        for holding in self.holdings:
            if (holding.nse_symbol or "").upper() == wanted:
                return holding
        return None

    def find(self, key: str) -> Holding | None:
        """Look a holding up by NSE symbol first, then by name."""
        return self.by_symbol(key) or self.by_name(key)

    def to_dict(self) -> dict[str, Any]:
        return {
            "as_of": self.as_of,
            "source": self.source,
            "holdings": [h.to_dict() for h in self.holdings],
        }


def _number(value: Any, field_name: str, holding_name: str, *, allow_none: bool) -> float | None:
    if value is None:
        if allow_none:
            return None
        raise HoldingsError(f"{holding_name}: {field_name} must not be null")
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise HoldingsError(f"{holding_name}: {field_name} must be a number, got {value!r}")
    return float(value)


def _text(value: Any, field_name: str, holding_name: str, *, allow_none: bool) -> str | None:
    if value is None:
        if allow_none:
            return None
        raise HoldingsError(f"{holding_name}: {field_name} must not be null")
    if not isinstance(value, str) or not value.strip():
        raise HoldingsError(f"{holding_name}: {field_name} must be a non-empty string, got {value!r}")
    return value.strip()


def _parse_holding(raw: Any, index: int) -> Holding:
    if not isinstance(raw, dict):
        raise HoldingsError(f"holdings[{index}] must be an object, got {type(raw).__name__}")

    name = _text(raw.get("name"), "name", f"holdings[{index}]", allow_none=False)
    assert name is not None  # _text raises when allow_none is False

    missing = [f for f in REQUIRED_FIELDS if f not in raw]
    if missing:
        raise HoldingsError(f"{name}: missing field(s) {', '.join(missing)}")

    unknown = [k for k in raw if k not in REQUIRED_FIELDS]
    if unknown:
        raise HoldingsError(f"{name}: unexpected field(s) {', '.join(sorted(unknown))}")

    nse_symbol = _text(raw["nse_symbol"], "nse_symbol", name, allow_none=True)
    yahoo_ticker = _text(raw["yahoo_ticker"], "yahoo_ticker", name, allow_none=True)
    if (nse_symbol is None) != (yahoo_ticker is None):
        raise HoldingsError(
            f"{name}: nse_symbol and yahoo_ticker must both be set or both be null "
            f"(got {nse_symbol!r} / {yahoo_ticker!r})"
        )
    if nse_symbol is not None:
        nse_symbol = nse_symbol.upper()

    verify_symbol = raw["verify_symbol"]
    if not isinstance(verify_symbol, bool):
        raise HoldingsError(f"{name}: verify_symbol must be true or false, got {verify_symbol!r}")

    qty = _number(raw["qty"], "qty", name, allow_none=False)
    assert qty is not None
    if qty <= 0:
        raise HoldingsError(f"{name}: qty must be positive, got {qty}")

    avg_cost = _number(raw["avg_cost"], "avg_cost", name, allow_none=True)
    if avg_cost is not None and avg_cost <= 0:
        # The broker app writes 0 when the cost basis is unknown; holdings.json
        # carries that as null so the dashboard can hide return % for the row.
        raise HoldingsError(
            f"{name}: avg_cost must be positive or null (null = cost basis missing), got {avg_cost}"
        )

    return Holding(
        name=name,
        nse_symbol=nse_symbol,
        yahoo_ticker=yahoo_ticker,
        sector=_text(raw["sector"], "sector", name, allow_none=False) or "Unknown",
        qty=qty,
        avg_cost=avg_cost,
        realized_pl=_number(raw["realized_pl"], "realized_pl", name, allow_none=True),
        verify_symbol=verify_symbol,
        notes=_text(raw["notes"], "notes", name, allow_none=True),
    )


def parse(payload: Any, *, path: Path | None = None) -> Portfolio:
    """Validate an already-decoded holdings document."""
    if not isinstance(payload, dict):
        raise HoldingsError(f"holdings file must contain an object, got {type(payload).__name__}")

    rows = payload.get("holdings")
    if not isinstance(rows, list) or not rows:
        raise HoldingsError("holdings file must contain a non-empty 'holdings' array")

    holdings = tuple(_parse_holding(raw, i) for i, raw in enumerate(rows))

    seen_names: dict[str, int] = {}
    seen_symbols: dict[str, int] = {}
    for i, holding in enumerate(holdings):
        key = holding.name.casefold()
        if key in seen_names:
            raise HoldingsError(f"duplicate holding name {holding.name!r} (rows {seen_names[key]} and {i})")
        seen_names[key] = i
        if holding.nse_symbol:
            if holding.nse_symbol in seen_symbols:
                raise HoldingsError(
                    f"duplicate nse_symbol {holding.nse_symbol!r} "
                    f"(rows {seen_symbols[holding.nse_symbol]} and {i})"
                )
            seen_symbols[holding.nse_symbol] = i

    as_of = _text(payload.get("as_of"), "as_of", "holdings file", allow_none=False) or ""
    try:
        date.fromisoformat(as_of)
    except ValueError as exc:
        raise HoldingsError(f"as_of must be an ISO date (YYYY-MM-DD), got {as_of!r}") from exc

    return Portfolio(
        as_of=as_of,
        source=_text(payload.get("source"), "source", "holdings file", allow_none=False) or "",
        holdings=holdings,
        path=path or config.HOLDINGS_FILE,
    )


def load(path: Path | None = None) -> Portfolio:
    """Read and validate holdings.json."""
    path = path or config.HOLDINGS_FILE
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError as exc:
        raise HoldingsError(f"holdings file not found: {path}") from exc
    try:
        payload = json.loads(text)
    except json.JSONDecodeError as exc:
        raise HoldingsError(f"{path} is not valid JSON: {exc}") from exc
    return parse(payload, path=path)


def save(portfolio: Portfolio, path: Path | None = None) -> Path:
    """Write holdings back, keeping the hand-editable formatting."""
    path = path or portfolio.path
    payload = portfolio.to_dict()
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return path


def replace_holdings(portfolio: Portfolio, holdings: Iterable[Holding]) -> Portfolio:
    ordered = tuple(sorted(holdings, key=lambda h: h.name.casefold()))
    return Portfolio(
        as_of=portfolio.as_of,
        source=portfolio.source,
        holdings=ordered,
        path=portfolio.path,
    )


@dataclass
class Summary:
    """What the loader wants a human to look at, in one object."""

    total_rows: int = 0
    listed_rows: int = 0
    unlisted: list[str] = field(default_factory=list)
    needs_symbol_check: list[str] = field(default_factory=list)
    missing_cost_basis: list[str] = field(default_factory=list)
    incomplete: list[str] = field(default_factory=list)
    sectors: dict[str, int] = field(default_factory=dict)


def summarize(portfolio: Portfolio) -> Summary:
    sectors: dict[str, int] = {}
    for holding in portfolio:
        sectors[holding.sector] = sectors.get(holding.sector, 0) + 1
    return Summary(
        total_rows=len(portfolio),
        listed_rows=len(portfolio.listed),
        unlisted=[h.name for h in portfolio.unlisted],
        needs_symbol_check=[h.name for h in portfolio.needs_symbol_check],
        missing_cost_basis=[h.name for h in portfolio.missing_cost_basis],
        incomplete=[h.name for h in portfolio.incomplete],
        sectors=dict(sorted(sectors.items(), key=lambda kv: (-kv[1], kv[0]))),
    )
