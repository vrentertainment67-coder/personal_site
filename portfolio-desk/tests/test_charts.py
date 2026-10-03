"""Chart geometry — including the rule that colour never carries the verdict alone."""

import pytest

from desk.charts import SHAPES, range_position, scatter, sparkline, value_by_verdict


def test_a_sparkline_spans_its_box_and_marks_the_last_point():
    spark = sparkline([10, 20, 30, 40, 50], width=100, height=20, pad=2)
    xs = [float(p.split(",")[0]) for p in spark.points.split()]
    ys = [float(p.split(",")[1]) for p in spark.points.split()]
    assert xs[0] == pytest.approx(2) and xs[-1] == pytest.approx(98)
    assert min(ys) == pytest.approx(2) and max(ys) == pytest.approx(18)
    assert (spark.last_x, spark.last_y) == (xs[-1], ys[-1])
    assert spark.rising is True


def test_a_falling_series_is_marked_falling_and_drawn_the_right_way_up():
    spark = sparkline([50, 40, 30, 20, 10], width=100, height=20)
    ys = [float(p.split(",")[1]) for p in spark.points.split()]
    assert spark.rising is False
    assert ys[0] < ys[-1]        # SVG y grows downward: a fall ends lower


def test_a_flat_series_does_not_divide_by_zero():
    spark = sparkline([100] * 10)
    assert spark is not None and spark.points


def test_too_few_points_yields_no_sparkline_rather_than_a_stub():
    assert sparkline([100, 101]) is None
    assert sparkline([]) is None


def test_the_range_marker_sits_where_price_sits():
    assert range_position(150, 100, 200) == pytest.approx(50)
    assert range_position(100, 100, 200) == pytest.approx(0)
    assert range_position(200, 100, 200) == pytest.approx(100)
    assert range_position(250, 100, 200) == pytest.approx(100)   # clamped
    assert range_position(150, None, 200) is None
    assert range_position(150, 200, 200) is None                 # degenerate range


# --------------------------------------------------------------- the scatter


class _Factor:
    def __init__(self, name, score, weight=0.2):
        self.name, self.score, self.weight = name, score, weight

    @property
    def contribution(self):
        return self.score * self.weight


class _Verdict(str):
    @property
    def value(self):
        return str(self)

    @property
    def tone(self):
        return {"Buy": "good", "Keep": "neutral", "Sell": "bad"}[str(self)]


class _Rating:
    def __init__(self, name, verdict, trend=None, valuation=None, value=0.0, score=0.0):
        self.name, self.score = name, score
        self.verdict = _Verdict(verdict)
        self.factors = [
            _Factor(n, s) for n, s in (("trend", trend), ("valuation", valuation))
            if s is not None
        ]
        self.position = type("P", (), {"symbol": name[:4].upper(), "value": value})()


def test_a_holding_without_valuation_is_left_off_rather_than_placed_at_zero():
    dots = scatter([
        _Rating("Has both", "Buy", trend=0.5, valuation=0.5),
        _Rating("Price only", "Sell", trend=-0.8),
    ])
    assert [d.name for d in dots] == ["Has both"]


def test_scores_map_onto_the_plot_corners():
    dots = scatter([_Rating("Cheap and rising", "Buy", trend=1.0, valuation=1.0),
                    _Rating("Dear and falling", "Sell", trend=-1.0, valuation=-1.0)])
    by_name = {d.name: d for d in dots}
    assert (by_name["Cheap and rising"].x, by_name["Cheap and rising"].y) == (100, 100)
    assert (by_name["Dear and falling"].x, by_name["Dear and falling"].y) == (0, 0)


def test_each_verdict_gets_its_own_shape_so_colour_is_never_the_only_channel():
    """Buy green against Sell red fails CVD separation; shape is the real signal."""
    dots = scatter([
        _Rating("A", "Buy", trend=0.5, valuation=0.5),
        _Rating("B", "Keep", trend=0.0, valuation=0.0),
        _Rating("C", "Sell", trend=-0.5, valuation=-0.5),
    ])
    assert {d.shape for d in dots} == {"up", "circle", "down"}
    assert len({d.shape for d in dots}) == len({d.verdict for d in dots})
    assert set(SHAPES) == {"Buy", "Keep", "Sell"}


def test_only_the_extremes_are_labelled_so_the_plot_stays_readable():
    ratings = [
        _Rating(f"Middling {i}", "Keep", trend=0.01 * i, valuation=0.01 * i)
        for i in range(20)
    ] + [_Rating("Extreme", "Sell", trend=-1.0, valuation=-1.0)]
    dots = scatter(ratings, max_labels=3)
    labelled = [d.name for d in dots if d.label]
    assert "Extreme" in labelled
    assert len(labelled) == 3


def test_every_dot_carries_a_tooltip_naming_its_numbers():
    dot = scatter([_Rating("X", "Buy", trend=0.4, valuation=0.6, score=0.33)])[0]
    assert "X — Buy (+0.33)" in dot.title
    assert "trend +0.40" in dot.title and "valuation +0.60" in dot.title


# ------------------------------------------------------- money by verdict


def test_the_value_bands_say_how_much_money_each_verdict_covers():
    ratings = [
        _Rating("A", "Buy", value=100_000),
        _Rating("B", "Keep", value=300_000),
        _Rating("C", "Keep", value=100_000),
        _Rating("D", "Sell", value=500_000),
    ]
    bands = value_by_verdict(ratings, total_value=1_000_000)
    by_verdict = {b.verdict: b for b in bands}
    assert [b.verdict for b in bands] == ["Buy", "Keep", "Sell"]     # fixed order
    assert by_verdict["Keep"].count == 2
    assert by_verdict["Keep"].value == pytest.approx(400_000)
    assert by_verdict["Sell"].share_pct == pytest.approx(50.0)


def test_an_empty_verdict_is_omitted_rather_than_drawn_as_a_sliver():
    bands = value_by_verdict([_Rating("A", "Buy", value=100)], total_value=100)
    assert [b.verdict for b in bands] == ["Buy"]


def test_no_total_value_does_not_divide_by_zero():
    bands = value_by_verdict([_Rating("A", "Buy", value=0)], total_value=0)
    assert bands[0].share_pct == 0.0
