"""Known OHLC in, known levels out."""

from datetime import date, timedelta

import pytest

from desk.levels import (
    Bar,
    Level,
    build,
    central_pivot_range,
    classic_pivots,
    cluster,
    previous_week_range,
    sma,
    swing_points,
)


def bars(closes, *, start=date(2026, 1, 1), spread=1.0):
    """Daily bars with a given close series; high/low sit `spread` either side."""
    out = []
    day = start
    for close in closes:
        out.append(Bar(day=day, open=close, high=close + spread, low=close - spread, close=close))
        day += timedelta(days=1)
    return out


def test_classic_pivots_match_the_textbook_formula():
    # H=110, L=90, C=100 -> P=100, span=20
    p = classic_pivots(110, 90, 100)
    assert p.p == pytest.approx(100)
    assert p.r1 == pytest.approx(110)   # 2P - L
    assert p.s1 == pytest.approx(90)    # 2P - H
    assert p.r2 == pytest.approx(120)   # P + (H-L)
    assert p.s2 == pytest.approx(80)    # P - (H-L)
    assert p.r3 == pytest.approx(130)   # H + 2(P-L)
    assert p.s3 == pytest.approx(70)    # L - 2(H-P)


def test_cpr_brackets_the_pivot_and_reports_width():
    cpr = central_pivot_range(110, 90, 100)
    assert cpr.p == pytest.approx(100)
    assert cpr.bc == pytest.approx(100)  # (H+L)/2
    assert cpr.tc == pytest.approx(100)  # 2P - BC
    assert cpr.width_pct == pytest.approx(0.0)

    # A close away from the midpoint opens the range up.
    wide = central_pivot_range(110, 90, 106)
    assert wide.tc > wide.bc
    assert wide.width_pct == pytest.approx(abs(wide.tc - wide.bc) / wide.p * 100)
    assert wide.shape in {"narrow", "average", "wide"}


def test_cpr_top_is_always_the_upper_edge():
    """2P-BC lands below BC when the close is weak; the dataclass still sorts them."""
    cpr = central_pivot_range(110, 90, 94)
    assert cpr.tc >= cpr.bc


def test_sma_needs_a_full_window():
    assert sma([1, 2, 3], 5) is None
    assert sma([1, 2, 3, 4, 5], 5) == pytest.approx(3)
    assert sma([1, 2, 3, 4, 5], 2) == pytest.approx(4.5)


def test_swing_points_find_fractal_highs_and_lows():
    series = bars([10, 11, 15, 11, 10, 9, 5, 9, 10], spread=0)
    highs, lows = swing_points(series, strength=2)
    assert highs == [15]
    assert lows == [5]


def test_previous_week_range_uses_the_last_completed_week():
    # Mon 5 Jan 2026 .. Fri 9 Jan, then Mon 12 Jan.
    series = [
        Bar(date(2026, 1, 5), 100, 105, 99, 102),
        Bar(date(2026, 1, 6), 102, 108, 101, 107),
        Bar(date(2026, 1, 9), 107, 110, 95, 100),
        Bar(date(2026, 1, 12), 100, 120, 90, 115),   # this week, must be excluded
    ]
    assert previous_week_range(series, today=date(2026, 1, 12)) == (110, 95)


def test_cluster_merges_levels_within_tolerance():
    levels = [
        Level(1000, "S1", "pivot"),
        Level(1003, "50 DMA", "pivot"),      # 0.3% away -> same zone
        Level(1100, "52w high", "pivot"),
    ]
    zones = cluster(levels, last_price=1050, tolerance_pct=0.75)
    assert len(zones) == 2
    support = [z for z in zones if z.side == "support"][0]
    assert support.strength == 2
    assert set(support.methods) == {"S1", "50 DMA"}
    assert support.center == pytest.approx(1001.5)
    assert [z.side for z in zones if z.center > 1050] == ["resistance"]


def test_cluster_keeps_distant_levels_apart():
    levels = [Level(1000, "a", "pivot"), Level(1010, "b", "pivot")]
    assert len(cluster(levels, last_price=1005, tolerance_pct=0.3)) == 2


def test_zone_distance_and_containment():
    zones = cluster([Level(990, "S1", "pivot"), Level(994, "20 DMA", "pivot")],
                    last_price=1000, tolerance_pct=0.75)
    zone = zones[0]
    assert zone.distance_pct(1000) == pytest.approx((992 / 1000 - 1) * 100)
    assert zone.contains(991) and not zone.contains(1000)


def test_build_assembles_every_level_and_ranks_zones():
    series = bars(list(range(100, 360)))  # 260 rising sessions
    ls = build("TEST", series, is_index=False)

    assert ls.last == pytest.approx(359)
    assert ls.prev_day_high == pytest.approx(360)
    assert ls.dma[20] == pytest.approx(sum(range(340, 360)) / 20)
    assert set(ls.dma) == {20, 50, 200}
    assert ls.week_52_high == pytest.approx(360)
    assert ls.zones
    # A rising series puts most zones below price.
    assert ls.nearest_support() is not None
    assert ls.supports()[0].center < ls.last


def test_build_marks_distance_to_the_52_week_extremes():
    series = bars([100] * 50 + [150] + [120] * 10)
    ls = build("TEST", series)
    assert ls.week_52_high == pytest.approx(151)
    assert ls.from_52w_high_pct() == pytest.approx((120 / 151 - 1) * 100)
    assert ls.dma_gap_pct(20) is not None


def test_index_zones_cluster_more_tightly_than_stock_zones():
    series = bars(list(range(1000, 1300)))
    index = build("NIFTY", series, is_index=True)
    stock = build("STOCK", series, is_index=False)
    assert len(index.zones) >= len(stock.zones)


def test_option_chain_levels_join_the_zones_when_supplied():
    series = bars(list(range(1000, 1260)))
    ls = build("NIFTY", series, is_index=True, oi_support=1200, oi_resistance=1300,
               pcr=1.1, max_pain=1250)
    methods = {m for z in ls.zones for m in z.methods}
    assert "highest put OI" in methods and "highest call OI" in methods
    assert ls.pcr == pytest.approx(1.1)


def test_build_refuses_an_empty_series():
    with pytest.raises(ValueError, match="no bars"):
        build("TEST", [])


def test_the_pivot_session_is_never_todays_partial_bar():
    """At 08:30 the history ends at yesterday; intraday it includes today."""
    from desk.levels import previous_session

    series = bars([100, 101, 102], start=date(2026, 10, 1))   # 1, 2, 3 Oct
    assert previous_session(series, today=date(2026, 10, 4)) == 2   # all complete
    assert previous_session(series, today=date(2026, 10, 3)) == 1   # today's bar skipped


def test_day_change_compares_against_the_prior_session_not_itself():
    """Regression: last == the final bar's close reported every stock unchanged."""
    series = bars([100, 102, 105], start=date(2026, 10, 1))
    ls = build("X", series, last=105, today=date(2026, 10, 4))
    assert ls.prev_close == pytest.approx(102)
    assert ls.day_change_pct == pytest.approx((105 / 102 - 1) * 100)


def test_an_explicit_previous_close_from_the_quote_wins():
    series = bars([100, 102, 105], start=date(2026, 10, 1))
    ls = build("X", series, last=107.5, prev_close=105, today=date(2026, 10, 4))
    assert ls.prev_close == pytest.approx(105)
    assert ls.day_change_pct == pytest.approx((107.5 / 105 - 1) * 100)


def test_pivots_use_the_last_completed_session():
    series = [
        Bar(date(2026, 10, 1), 100, 110, 90, 100),
        Bar(date(2026, 10, 2), 100, 200, 50, 120),   # today's partial bar
    ]
    ls = build("X", series, last=120, today=date(2026, 10, 2))
    assert ls.pivots.p == pytest.approx((110 + 90 + 100) / 3)
    assert ls.prev_day_high == pytest.approx(110)


def test_a_zone_never_grows_wider_than_its_tolerance():
    """Regression: comparing only to the running mean let zones chain and drift."""
    from desk.levels import Level, cluster

    chain = [Level(100 + i * 0.7, f"m{i}", "p") for i in range(10)]   # 100.0 .. 106.3
    zones = cluster(chain, last_price=120, tolerance_pct=0.75)
    for zone in zones:
        assert (zone.high - zone.low) / zone.center * 100 <= 0.75 + 1e-9
    assert len(zones) > 1
