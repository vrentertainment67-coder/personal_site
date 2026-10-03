"""The scorecard: same data in, same verdict out, and every verdict explainable."""

from datetime import date, timedelta

import pytest

from desk import holdings as holdings_mod
from desk.levels import Bar, build
from desk.market import MarketData, Price
from desk.portfolio import analyse
from desk.ratings import (
    BUY_ABOVE,
    SELL_BELOW,
    Verdict,
    annualised_vol,
    rate,
    rate_all,
    tally,
)


def bars(closes, *, spread=1.0, start=date(2026, 1, 1)):
    out, day = [], start
    for c in closes:
        out.append(Bar(day=day, open=c, high=c + spread, low=c - spread, close=c, volume=1000))
        day += timedelta(days=1)
    return out


def row(**overrides):
    base = {
        "name": "Test Co", "nse_symbol": "TEST", "yahoo_ticker": "TEST.NS", "sector": "IT",
        "qty": 100, "avg_cost": 100.0, "realized_pl": 0, "verify_symbol": False, "notes": None,
    }
    base.update(overrides)
    return base


def setup(price, closes, *, extra_rows=(), **row_kwargs):
    portfolio = holdings_mod.parse({
        "as_of": "2026-10-03", "source": "test",
        "holdings": [row(**row_kwargs), *extra_rows],
    })
    prices = {"TEST": Price("TEST", price, "live", "2026-10-03")}
    for extra in extra_rows:
        prices[extra["nse_symbol"]] = Price(extra["nse_symbol"], 100.0, "live", "2026-10-03")
    analytics = analyse(portfolio, MarketData(prices=prices))
    levels = build("TEST", bars(closes), last=price, today=date(2026, 12, 31))
    position = next(p for p in analytics.positions if p.symbol == "TEST")
    return position, levels, analytics, closes


# --------------------------------------------------------------- the verdict


def test_a_steady_uptrend_near_its_high_rates_buy():
    position, levels, analytics, closes = setup(
        359, list(range(100, 360)), avg_cost=100.0,
        extra_rows=[row(name="Ballast", nse_symbol="BAL", yahoo_ticker="BAL.NS", qty=10000)],
    )
    rating = rate(position, levels, analytics, closes)
    assert rating.verdict is Verdict.BUY
    assert rating.score >= BUY_ABOVE
    assert any("Above every moving average" in r for r in rating.reasons)


def test_a_steady_downtrend_near_its_low_rates_sell():
    position, levels, analytics, closes = setup(
        101, list(range(360, 100, -1)), avg_cost=300.0,
        extra_rows=[row(name="Ballast", nse_symbol="BAL", yahoo_ticker="BAL.NS", qty=10000)],
    )
    rating = rate(position, levels, analytics, closes)
    assert rating.verdict is Verdict.SELL
    assert rating.score <= SELL_BELOW
    assert any("Below every moving average" in r for r in rating.reasons)


def test_a_directionless_stock_rates_keep():
    position, levels, analytics, closes = setup(
        100, [100 + (i % 7) - 3 for i in range(260)],
        extra_rows=[row(name="Ballast", nse_symbol="BAL", yahoo_ticker="BAL.NS", qty=10000)],
    )
    rating = rate(position, levels, analytics, closes)
    assert rating.verdict is Verdict.KEEP


def test_the_score_is_the_weighted_sum_of_its_factors():
    position, levels, analytics, closes = setup(359, list(range(100, 360)))
    rating = rate(position, levels, analytics, closes)
    expected = sum(f.contribution for f in rating.factors) / sum(f.weight for f in rating.factors)
    assert rating.score == pytest.approx(expected)
    assert len(rating.reasons) == len(rating.factors)


def test_rating_the_same_data_twice_gives_the_same_answer():
    args = setup(359, list(range(100, 360)))
    first, second = rate(*args), rate(*args)
    assert first.verdict is second.verdict
    assert first.score == pytest.approx(second.score)


# ------------------------------------------------------------ risk overrides


def test_a_position_big_enough_to_drive_the_portfolio_is_never_a_buy():
    """A 24% holding in a good uptrend is still not something to add to."""
    position, levels, analytics, closes = setup(359, list(range(100, 360)))
    rating = rate(position, levels, analytics, closes)       # single holding = 100% weight
    assert rating.verdict is Verdict.KEEP
    assert any("held back to Keep" in c for c in rating.caveats)
    assert rating.score >= BUY_ABOVE                          # the score still says what it says


def test_concentration_weighs_on_the_score_above_the_threshold():
    heavy, levels, analytics, closes = setup(359, list(range(100, 360)))
    size = next(f for f in rate(heavy, levels, analytics, closes).factors if f.name == "size")
    assert size.score < 0
    assert "drives the whole portfolio" in size.reason

    light, levels2, analytics2, closes2 = setup(
        359, list(range(100, 360)),
        extra_rows=[row(name="Ballast", nse_symbol="BAL", yahoo_ticker="BAL.NS", qty=10000)],
    )
    size2 = next(f for f in rate(light, levels2, analytics2, closes2).factors if f.name == "size")
    assert size2.score == 0


# ------------------------------------------------------------- missing data


def test_no_price_means_no_rating():
    portfolio = holdings_mod.parse({
        "as_of": "2026-10-03", "source": "test", "holdings": [row()],
    })
    analytics = analyse(portfolio, MarketData(prices={}))
    rating = rate(analytics.positions[0], None, analytics)
    assert rating.verdict is Verdict.NO_RATING
    assert "no price" in rating.caveats[0]


def test_no_history_means_no_rating_not_a_guess():
    position, _, analytics, _ = setup(100, [100] * 260)
    rating = rate(position, None, analytics)
    assert rating.verdict is Verdict.NO_RATING
    assert any("no price history" in c for c in rating.caveats)


def test_an_unverified_ticker_is_carried_as_a_caveat_on_the_rating():
    position, levels, analytics, closes = setup(
        359, list(range(100, 360)), verify_symbol=True,
        extra_rows=[row(name="Ballast", nse_symbol="BAL", yahoo_ticker="BAL.NS", qty=10000)],
    )
    rating = rate(position, levels, analytics, closes)
    assert any("never verified" in c for c in rating.caveats)


def test_a_missing_cost_basis_narrows_the_scorecard_rather_than_blocking_it():
    position, levels, analytics, closes = setup(
        359, list(range(100, 360)), avg_cost=None,
        extra_rows=[row(name="Ballast", nse_symbol="BAL", yahoo_ticker="BAL.NS", qty=10000)],
    )
    rating = rate(position, levels, analytics, closes)
    assert rating.verdict is not Verdict.NO_RATING
    assert "your cost" not in {f.name for f in rating.factors}
    assert rating.confidence in {"full", "partial"}


# -------------------------------------------------------------- flip levels


def test_flip_levels_are_solved_not_predicted():
    position, levels, analytics, closes = setup(
        230, list(range(100, 360)),
        extra_rows=[row(name="Ballast", nse_symbol="BAL", yahoo_ticker="BAL.NS", qty=10000)],
    )
    rating = rate(position, levels, analytics, closes)
    assert rating.flip_levels
    for key, price in rating.flip_levels.items():
        assert price > 0
        if key == "to Buy":
            assert price > levels.last
        if key == "to Sell":
            assert price < levels.last
    # And the probe left the level set as it found it.
    assert levels.last == 230


def test_volatility_is_computed_from_the_returns_it_was_given():
    calm = [100 * (1.001 ** i) for i in range(120)]
    wild = [100 * (1.05 if i % 2 else 0.95) ** 1 for i in range(120)]
    levels = build("TEST", bars(calm), last=calm[-1], today=date(2026, 12, 31))
    assert annualised_vol(levels, calm) < annualised_vol(levels, wild)
    assert annualised_vol(levels, calm[:5]) is None


# ------------------------------------------------------------------ the set


def test_rate_all_orders_buys_first_and_tallies():
    portfolio = holdings_mod.parse({
        "as_of": "2026-10-03", "source": "test",
        "holdings": [
            row(name="Up", nse_symbol="UP", yahoo_ticker="UP.NS", qty=10),
            row(name="Down", nse_symbol="DOWN", yahoo_ticker="DOWN.NS", qty=10),
            row(name="Unpriced", nse_symbol="NOPE", yahoo_ticker="NOPE.NS", qty=10),
        ],
    })
    analytics = analyse(portfolio, MarketData(prices={
        "UP": Price("UP", 359, "live", "2026-10-03"),
        "DOWN": Price("DOWN", 101, "live", "2026-10-03"),
    }))
    levels = {
        "UP": build("UP", bars(list(range(100, 360))), last=359, today=date(2026, 12, 31)),
        "DOWN": build("DOWN", bars(list(range(360, 100, -1))), last=101, today=date(2026, 12, 31)),
    }
    closes = {"UP": list(range(100, 360)), "DOWN": list(range(360, 100, -1))}
    ratings = rate_all(analytics, levels, closes)

    assert [r.name for r in ratings][-1] == "Unpriced"
    assert ratings[-1].verdict is Verdict.NO_RATING
    assert tally(ratings)["No rating"] == 1
    assert {r.name for r in ratings if r.verdict is Verdict.SELL} == {"Down"}


# ------------------------------------------- valuation, quality, relative


def fundamentals(**kw):
    from desk.sources.fundamentals import Fundamentals
    return Fundamentals(symbol="TEST", **kw)


def relative_of(stock_3m, sector_3m, index="NIFTY IT"):
    from desk.relative import Relative
    return Relative(symbol="TEST", sector="IT", sector_index=index,
                    stock={"3m": stock_3m}, sector_returns={"3m": sector_3m},
                    market_returns={"3m": 1.0})


def test_a_cheap_profitable_stock_scores_better_than_an_expensive_weak_one():
    position, levels, analytics, closes = setup(
        200, [100 + i for i in range(260)],
        extra_rows=[row(name="Ballast", nse_symbol="BAL", yahoo_ticker="BAL.NS", qty=10000)],
    )
    cheap = rate(position, levels, analytics, closes,
                 fundamentals=fundamentals(pe=11.0, price_to_book=1.2, roe_pct=24.0,
                                           operating_margin_pct=28.0, debt_to_equity=15.0))
    rich = rate(position, levels, analytics, closes,
                fundamentals=fundamentals(pe=70.0, price_to_book=12.0, roe_pct=3.0,
                                          operating_margin_pct=2.0, debt_to_equity=300.0))
    assert cheap.score > rich.score
    assert "P/E 11.0" in " ".join(cheap.reasons)
    assert "ROE 24%" in " ".join(cheap.reasons)


def test_a_fall_shared_with_the_sector_scores_better_than_a_lonely_one():
    """The Infosys question: is it the stock, or everything around it?"""
    position, levels, analytics, closes = setup(
        101, list(range(360, 100, -1)),
        extra_rows=[row(name="Ballast", nse_symbol="BAL", yahoo_ticker="BAL.NS", qty=10000)],
    )
    with_sector = rate(position, levels, analytics, closes,
                       relative=relative_of(-38.0, -36.0))
    alone = rate(position, levels, analytics, closes,
                 relative=relative_of(-38.0, +2.0))
    assert with_sector.score > alone.score
    assert "sector-wide" in with_sector.headline or "with its sector" in with_sector.headline
    assert "Falling faster than its sector" in alone.headline


def test_the_headline_names_the_factor_that_actually_drove_the_verdict():
    position, levels, analytics, closes = setup(
        359, list(range(100, 360)),
        extra_rows=[row(name="Ballast", nse_symbol="BAL", yahoo_ticker="BAL.NS", qty=10000)],
    )
    rating = rate(position, levels, analytics, closes)
    driver = max(rating.factors, key=lambda f: abs(f.contribution))
    assert driver.name in rating.headline


def test_what_you_paid_is_shown_but_never_scored():
    """Being up 237% must not make a falling stock look like a Buy."""
    position, levels, analytics, closes = setup(
        101, list(range(360, 100, -1)), avg_cost=30.0,     # a huge gain on cost
        extra_rows=[row(name="Ballast", nse_symbol="BAL", yahoo_ticker="BAL.NS", qty=10000)],
    )
    rating = rate(position, levels, analytics, closes)
    assert "your cost" not in {f.name for f in rating.factors}
    assert rating.cost_note and "+237%" in rating.cost_note
    assert rating.verdict is Verdict.SELL


def test_missing_fundamentals_are_declared_rather_than_assumed_neutral():
    position, levels, analytics, closes = setup(
        359, list(range(100, 360)),
        extra_rows=[row(name="Ballast", nse_symbol="BAL", yahoo_ticker="BAL.NS", qty=10000)],
    )
    rating = rate(position, levels, analytics, closes)
    assert any("price-only" in c for c in rating.caveats)
    assert "valuation" not in {f.name for f in rating.factors}


def test_imminent_results_make_the_verdict_provisional():
    from datetime import date, timedelta

    position, levels, analytics, closes = setup(
        359, list(range(100, 360)),
        extra_rows=[row(name="Ballast", nse_symbol="BAL", yahoo_ticker="BAL.NS", qty=10000)],
    )
    soon = (date.today() + timedelta(days=3)).isoformat()
    rating = rate(position, levels, analytics, closes,
                  fundamentals=fundamentals(pe=20.0, roe_pct=15.0, earnings_date=soon))
    assert any("results due in 3 days" in c for c in rating.caveats)


def test_a_loss_making_company_is_marked_down_not_skipped():
    position, levels, analytics, closes = setup(
        200, [100 + i for i in range(260)],
        extra_rows=[row(name="Ballast", nse_symbol="BAL", yahoo_ticker="BAL.NS", qty=10000)],
    )
    rating = rate(position, levels, analytics, closes,
                  fundamentals=fundamentals(pe=-8.0, price_to_book=3.0))
    valuation = next(f for f in rating.factors if f.name == "valuation")
    assert valuation.score < 0
    assert "no positive earnings" in valuation.reason
