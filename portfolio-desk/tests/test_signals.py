"""The attention engine: every ranking must be explainable from its signals."""

from datetime import date, timedelta

import pytest

from desk import holdings as holdings_mod
from desk.levels import Bar, build
from desk.market import MarketData, Price
from desk.portfolio import analyse
from desk.signals import level_signals, portfolio_signals, position_signals, rank


def bars(closes, *, spread=1.0, start=date(2026, 1, 1)):
    out, day = [], start
    for c in closes:
        out.append(Bar(day=day, open=c, high=c + spread, low=c - spread, close=c))
        day += timedelta(days=1)
    return out


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


def market(prices, prev=None):
    return MarketData(prices={
        s: Price(symbol=s, last=p, tier="live", as_of="2026-10-03", prev_close=(prev or {}).get(s))
        for s, p in prices.items()
    })


def test_a_flat_year_does_not_count_as_a_52_week_extreme():
    """In a 3%-wide year, every price is "near the high". That is not a signal."""
    series = bars([100 + (i % 3) for i in range(260)])
    ls = build("CALM", series, last=101.5)
    codes = {s.code for s in level_signals(ls)}
    assert "at_52w_high" not in codes and "at_52w_low" not in codes


def test_a_wide_year_does_count():
    series = bars(list(range(100, 360)))     # 3.6x range
    assert "at_52w_high" in {s.code for s in level_signals(build("UP", series))}


def test_price_at_a_52_week_high_is_flagged():
    series = bars(list(range(100, 360)))
    ls = build("UP", series)
    codes = {s.code for s in level_signals(ls)}
    assert "at_52w_high" in codes
    signal = next(s for s in level_signals(ls) if s.code == "at_52w_high")
    assert signal.tone == "good" and "%" in signal.detail


def test_price_at_a_52_week_low_is_flagged():
    series = bars(list(range(360, 100, -1)))
    ls = build("DOWN", series)
    assert "at_52w_low" in {s.code for s in level_signals(ls)}


def test_a_dma_cross_needs_the_previous_close_on_the_other_side():
    series = bars([100] * 199 + [90])        # 20 DMA well above the last close
    ls = build("X", series)
    ls.prev_close = ls.dma[20] + 5           # yesterday above, today below
    ls.last = ls.dma[20] - 5
    codes = {s.code for s in level_signals(ls)}
    assert "dma_cross_down" in codes
    assert "dma_cross_up" not in codes


def test_no_cross_is_reported_when_price_stays_on_one_side():
    series = bars([100] * 260)
    ls = build("X", series)
    ls.prev_close = ls.dma[20] + 5
    ls.last = ls.dma[20] + 6
    assert not {s.code for s in level_signals(ls)} & {"dma_cross_up", "dma_cross_down"}


def test_a_big_session_move_is_flagged_with_its_size():
    series = bars([100] * 260)
    ls = build("X", series, last=105)
    signal = next(s for s in level_signals(ls) if s.code == "big_move")
    assert "+5.0%" in signal.headline


def test_near_support_reports_what_agrees_there():
    series = bars(list(range(100, 360)))
    ls = build("X", series)
    support = ls.nearest_support()
    ls.last = support.center * 1.01           # above the zone, past the 0.75% floor
    signals = [s for s in level_signals(ls) if s.code in {"near_support", "inside_zone"}]
    assert signals
    # The reason names the families that agree, which is what `strength` counts.
    assert any(f in signals[0].detail for f in support.families)


def test_index_proximity_is_tighter_than_stock_proximity():
    series = bars(list(range(1000, 1300)))
    ls = build("NIFTY", series, is_index=True)
    support = ls.nearest_support()
    ls.last = support.center * 1.005           # 0.5% away
    assert not [s for s in level_signals(ls, is_index=True) if s.code == "near_support"]
    assert [s for s in level_signals(ls, is_index=False) if s.code == "near_support"]


def test_only_the_nearest_zone_per_side_is_reported():
    """Six "near support" lines on one stock is noise, not signal."""
    series = bars(list(range(100, 360)))
    ls = build("X", series)
    ls.last = ls.nearest_support().center * 1.004
    codes = [s.code for s in level_signals(ls)]
    assert codes.count("near_support") <= 1
    assert codes.count("near_resistance") <= 1


def test_a_zone_backed_by_one_family_needs_price_much_closer():
    """pivot + CPR top + CPR bottom is one calculation agreeing with itself."""
    from desk.levels import Level, cluster

    pivots_only = cluster(
        [Level(100, "pivot", "p"), Level(100.2, "CPR top", "p"), Level(99.8, "CPR bottom", "p")],
        last_price=101.5, tolerance_pct=0.75,
    )[0]
    assert pivots_only.strength == 1          # one family, not three methods

    mixed = cluster(
        [Level(100, "S1", "p"), Level(100.2, "50 DMA", "p"), Level(99.9, "prev day low", "p")],
        last_price=101.5, tolerance_pct=0.75,
    )[0]
    assert mixed.strength == 3


def test_position_signals_cover_events_news_volume_and_drawdown():
    a = analyse(portfolio_of(row(avg_cost=200)), market({"RELIANCE": 100}))
    position = a.positions[0]
    signals = position_signals(position, news_count=3, event="Q2 results", volume_ratio=2.4)
    codes = {s.code for s in signals}
    assert codes == {"event", "news", "volume_spike", "deep_drawdown"}
    assert "3 news items today" in {s.headline for s in signals}


def test_an_unverified_ticker_and_a_missing_cost_basis_are_signals():
    a = analyse(
        portfolio_of(row(name="LTM", nse_symbol="LTM", yahoo_ticker="LTM.NS",
                         avg_cost=None, verify_symbol=True)),
        market({"LTM": 4017}),
    )
    codes = {s.code for s in position_signals(a.positions[0])}
    assert codes == {"no_cost_basis", "unverified_ticker"}


def test_rank_puts_the_loudest_holding_first_and_explains_why():
    a = analyse(
        portfolio_of(
            row(),
            row(name="Infosys", nse_symbol="INFY", yahoo_ticker="INFY.NS", sector="IT",
                qty=210, avg_cost=307.01),
        ),
        market({"RELIANCE": 1167.70, "INFY": 1035.0}),
    )
    levels = {"INFY": build("INFY", bars(list(range(800, 1060))))}
    ranked = rank(a, levels, news={"INFY": 2}, events={"INFY": "Q2 results"})
    assert ranked[0].name == "Infosys"
    assert ranked[0].score > 0
    assert any("results" in r for r in ranked[0].reasons)


def test_rank_omits_holdings_with_nothing_to_say():
    a = analyse(portfolio_of(row()), market({"RELIANCE": 1167.70}))
    assert rank(a, {}) == []


def test_size_tilts_the_order_but_cannot_invent_a_signal():
    """A heavy position with no signal stays off the list entirely."""
    a = analyse(
        portfolio_of(
            row(name="Big", nse_symbol="BIG", yahoo_ticker="BIG.NS", qty=1000, avg_cost=10),
            row(name="Small", nse_symbol="SMALL", yahoo_ticker="SMALL.NS", qty=1, avg_cost=10),
        ),
        market({"BIG": 100, "SMALL": 100}),
    )
    ranked = rank(a, {}, news={"SMALL": 1})
    assert [r.name for r in ranked] == ["Small"]

    both = rank(a, {}, news={"SMALL": 1, "BIG": 1})
    assert [r.name for r in both] == ["Big", "Small"]   # same signal, size breaks the tie


def test_portfolio_signals_flag_concentration_and_sector_tilt():
    a = analyse(
        portfolio_of(
            row(name="A", nse_symbol="A", yahoo_ticker="A.NS", sector="IT", qty=100, avg_cost=10),
            row(name="B", nse_symbol="B", yahoo_ticker="B.NS", sector="IT", qty=1, avg_cost=10),
        ),
        market({"A": 100, "B": 100}),
    )
    headlines = " ".join(s.headline for s in portfolio_signals(a))
    assert "Top 3" in headlines
    assert "IT is" in headlines


def test_scores_are_the_sum_of_their_signals():
    a = analyse(portfolio_of(row(avg_cost=200)), market({"RELIANCE": 100}))
    ranked = rank(a, {}, news={"RELIANCE": 1})
    item = ranked[0]
    base = sum(s.weight for s in item.signals)
    assert item.score == pytest.approx(base * (1 + min((item.weight_pct or 0) / 100, 0.25)))
    assert len(item.reasons) == len(item.signals)


def test_crossing_several_averages_is_one_line_not_three():
    series = bars([100] * 260)
    ls = build("X", series)
    ls.prev_close = 99
    ls.dma = {20: 99.5, 50: 99.7, 200: 99.9}
    ls.last = 100.5
    ups = [s for s in level_signals(ls) if s.code == "dma_cross_up"]
    assert len(ups) == 1
    assert "20 DMA, 50 DMA and 200 DMA" in ups[0].headline
    # and it outranks a single-average cross
    ls.dma = {20: 99.5}
    single = [s for s in level_signals(ls) if s.code == "dma_cross_up"][0]
    assert ups[0].weight > single.weight


def test_crossing_in_both_directions_reports_each_direction_once():
    series = bars([100] * 260)
    ls = build("X", series)
    ls.prev_close = 100
    ls.dma = {20: 99.0, 200: 101.0}      # moved up through one, down through none
    ls.last = 101.5
    codes = [s.code for s in level_signals(ls)]
    assert codes.count("dma_cross_up") == 1
    assert "dma_cross_down" not in codes


def test_sitting_on_an_average_is_not_a_crossing():
    series = bars([100] * 260)
    ls = build("X", series)
    ls.dma = {50: 100.0}
    ls.prev_close = 99.99
    ls.last = 100.01                     # 0.01% through it
    assert not [s for s in level_signals(ls) if s.code == "dma_cross_up"]
    ls.last = 100.5                      # 0.5% through it
    assert [s for s in level_signals(ls) if s.code == "dma_cross_up"]


def test_small_prices_keep_their_paise_in_the_reason_text():
    series = bars([4.0] * 260, spread=0.05)
    ls = build("LML", series)
    ls.dma = {50: 4.02}
    ls.prev_close = 4.05
    ls.last = 3.90
    detail = [s for s in level_signals(ls) if s.code == "dma_cross_down"][0].detail
    assert "4.02" in detail and "4.05" in detail
