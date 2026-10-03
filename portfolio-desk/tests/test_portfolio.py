"""Analytics rules the dashboard leans on."""

import pytest

from desk import holdings as holdings_mod
from desk.market import MarketData, Price, SourceStatus
from desk.portfolio import analyse


def row(**overrides):
    base = {
        "name": "Reliance Industries", "nse_symbol": "RELIANCE", "yahoo_ticker": "RELIANCE.NS",
        "sector": "Oil & Gas", "qty": 60, "avg_cost": 42.11, "realized_pl": 1710,
        "verify_symbol": False, "notes": None,
    }
    base.update(overrides)
    return base


def portfolio_of(*rows):
    return holdings_mod.parse({"as_of": "2026-10-03", "source": "test", "holdings": list(rows)})


def market(prices, *, tier="snapshot", prev=None):
    return MarketData(
        prices={
            sym: Price(symbol=sym, last=p, tier=tier, as_of="2026-10-03",
                       prev_close=(prev or {}).get(sym))
            for sym, p in prices.items()
        },
        statuses=[SourceStatus("test", "stale")],
    )


def test_value_and_return_use_the_cost_basis():
    a = analyse(portfolio_of(row()), market({"RELIANCE": 1167.70}))
    position = a.positions[0]
    assert position.value == pytest.approx(70062.0)
    assert position.unrealised == pytest.approx(70062.0 - 60 * 42.11)
    assert position.return_pct == pytest.approx((1167.70 / 42.11 - 1) * 100)
    assert a.weight_pct(position) == pytest.approx(100.0)


def test_a_missing_cost_basis_yields_no_pl_and_no_return():
    """v0 counted the whole position as profit; that is the bug this prevents."""
    a = analyse(
        portfolio_of(row(name="Page Industries", nse_symbol="PAGEIND",
                         yahoo_ticker="PAGEIND.NS", qty=20, avg_cost=None, realized_pl=0)),
        market({"PAGEIND": 36660.0}),
    )
    position = a.positions[0]
    assert position.value == pytest.approx(733200.0)
    assert position.unrealised is None
    assert position.return_pct is None
    assert a.unrealised is None          # nothing measurable in this portfolio
    assert a.measurable == 0
    assert a.weight_pct(position) == pytest.approx(100.0)  # value still counts


def test_portfolio_totals_separate_measurable_rows_from_the_rest():
    a = analyse(
        portfolio_of(
            row(),
            row(name="Coal India", nse_symbol="COALINDIA", yahoo_ticker="COALINDIA.NS",
                qty=100, avg_cost=None, realized_pl=12875),
        ),
        market({"RELIANCE": 1167.70, "COALINDIA": 421.50}),
    )
    assert a.total_value == pytest.approx(70062.0 + 42150.0)
    assert a.invested_with_cost == pytest.approx(60 * 42.11)
    assert a.unrealised == pytest.approx(70062.0 - 60 * 42.11)
    assert a.measurable == 1
    assert [p.name for p in a.no_cost_basis] == ["Coal India"]


def test_unpriced_rows_are_excluded_from_value_and_weights():
    a = analyse(
        portfolio_of(
            row(),
            row(name="State Bank of India", nse_symbol="SBIN", yahoo_ticker="SBIN.NS",
                qty=300, avg_cost=276.82, realized_pl=None),
            row(name="Bgse Properties", nse_symbol=None, yahoo_ticker=None,
                sector="Unlisted", qty=1000, avg_cost=None, realized_pl=0),
        ),
        market({"RELIANCE": 1167.70}),
    )
    assert a.priced_count == 1
    assert a.total_value == pytest.approx(70062.0)
    assert sorted(p.name for p in a.unpriced) == ["Bgse Properties", "State Bank of India"]
    assert all(a.weight_pct(p) is None for p in a.unpriced)
    assert sum(s.weight_pct for s in a.sectors) == pytest.approx(100.0)


def test_concentration_and_the_ten_percent_scenario():
    a = analyse(
        portfolio_of(
            row(name="A", nse_symbol="A", yahoo_ticker="A.NS", qty=10, avg_cost=10),
            row(name="B", nse_symbol="B", yahoo_ticker="B.NS", qty=10, avg_cost=10),
            row(name="C", nse_symbol="C", yahoo_ticker="C.NS", qty=10, avg_cost=10),
            row(name="D", nse_symbol="D", yahoo_ticker="D.NS", qty=10, avg_cost=10),
        ),
        market({"A": 100, "B": 50, "C": 30, "D": 20}),
    )
    conc = a.concentration
    assert conc.top3_names == ["A", "B", "C"]
    assert conc.top3_value == pytest.approx(1800.0)
    assert conc.top3_pct == pytest.approx(90.0)
    assert conc.top3_drawdown_10pct == pytest.approx(180.0)


def test_day_change_needs_a_previous_close():
    without = analyse(portfolio_of(row()), market({"RELIANCE": 1167.70}))
    assert without.day_change_value is None

    with_prev = analyse(
        portfolio_of(row()),
        market({"RELIANCE": 1167.70}, tier="live", prev={"RELIANCE": 1150.0}),
    )
    assert with_prev.day_change_value == pytest.approx(60 * 17.70)
    assert with_prev.positions[0].day_change_pct == pytest.approx((1167.70 / 1150 - 1) * 100)


def test_sectors_are_ranked_by_value():
    a = analyse(
        portfolio_of(
            row(),
            row(name="Infosys", nse_symbol="INFY", yahoo_ticker="INFY.NS", sector="IT",
                qty=210, avg_cost=307.01),
        ),
        market({"RELIANCE": 1167.70, "INFY": 1035.0}),
    )
    assert [s.name for s in a.sectors] == ["IT", "Oil & Gas"]
    assert a.sectors[0].weight_pct > a.sectors[1].weight_pct


def test_losers_lists_drawdowns_worst_first():
    a = analyse(
        portfolio_of(
            row(name="Asian Granito", nse_symbol="ASIANTILES", yahoo_ticker="ASIANTILES.NS",
                qty=140, avg_cost=80),
            row(name="Adani Wilmar", nse_symbol="AWL", yahoo_ticker="AWL.NS",
                qty=100, avg_cost=277.25),
            row(),
        ),
        market({"ASIANTILES": 48.06, "AWL": 175.80, "RELIANCE": 1167.70}),
    )
    assert [p.name for p in a.losers] == ["Asian Granito", "Adani Wilmar"]


def test_a_huge_return_is_shown_as_a_multiple_not_a_percentage():
    """"+63,416%" is unreadable; "634x" is not."""
    from desk.format import multiple

    # +63,416% means the holding is worth 635 times what it cost, not 634.
    assert multiple(63416.0) == "635x"
    assert multiple(900.0) == "+900.0%"      # below the threshold, still a percentage
    assert multiple(237.0) == "+237.0%"
    assert multiple(-36.0) == "-36.0%"
    assert multiple(None) == "—"
