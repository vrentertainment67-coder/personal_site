"""Yahoo fundamentals: parsing, and what happens when a field is absent."""

import pytest

from desk.sources.fundamentals import Fundamentals, FundamentalsClient, _parse


def wrapped(value):
    return {"raw": value, "fmt": str(value)}


SAMPLE = {
    "summaryDetail": {
        "trailingPE": wrapped(22.4),
        "forwardPE": wrapped(19.8),
        "dividendYield": wrapped(0.0243),       # fractions on the wire
        "marketCap": wrapped(4.3e12),
    },
    "defaultKeyStatistics": {"priceToBook": wrapped(5.1)},
    "financialData": {
        "returnOnEquity": wrapped(0.284),
        "operatingMargins": wrapped(0.21),
        "debtToEquity": wrapped(9.7),
        "revenueGrowth": wrapped(0.061),
        "targetMeanPrice": wrapped(1420.0),
        "recommendationKey": "hold",
        "numberOfAnalystOpinions": wrapped(42),
    },
    # Yahoo nests this: calendarEvents.earnings.earningsDate
    "calendarEvents": {"earnings": {"earningsDate": [wrapped(1792300000)]}},
}


def test_the_wire_format_is_unwrapped_and_ratios_become_percentages():
    f = _parse("INFY", SAMPLE)
    assert f.pe == pytest.approx(22.4)
    assert f.forward_pe == pytest.approx(19.8)
    assert f.price_to_book == pytest.approx(5.1)
    assert f.dividend_yield_pct == pytest.approx(2.43)
    assert f.roe_pct == pytest.approx(28.4)
    assert f.operating_margin_pct == pytest.approx(21.0)
    assert f.revenue_growth_pct == pytest.approx(6.1)
    assert f.analyst_count == 42
    assert f.recommendation == "hold"


def test_missing_blocks_leave_fields_empty_rather_than_zero():
    f = _parse("NEW", {})
    assert f.pe is None and f.roe_pct is None and f.earnings_date is None
    assert f.has_valuation is False and f.has_quality is False


def test_a_loss_making_company_has_no_pe_and_that_is_not_a_zero():
    f = _parse("X", {"summaryDetail": {"trailingPE": None}, "defaultKeyStatistics": {}})
    assert f.pe is None
    assert f.has_valuation is False


def test_the_earnings_date_is_read_and_counted_down():
    from datetime import date

    f = _parse("INFY", SAMPLE)
    assert f.earnings_date  # an ISO date
    assert isinstance(f.days_to_earnings(date.fromisoformat(f.earnings_date)), int)
    assert f.days_to_earnings(date.fromisoformat(f.earnings_date)) == 0


def test_a_malformed_earnings_date_does_not_raise():
    f = Fundamentals(symbol="X", earnings_date="not-a-date")
    assert f.days_to_earnings() is None


class _Http:
    def __init__(self, status, payload, text="abc123"):
        self.status, self.payload, self.text = status, payload, text
        self.session = type("S", (), {"get": lambda *a, **k: None})()
        self.failures = []

    def get_text(self, url, **kw):
        return self.text

    def get_json(self, url, **kw):
        return type("R", (), {"status": self.status, "payload": self.payload,
                              "ok": 200 <= self.status < 300})()


def client_with(http):
    c = FundamentalsClient()
    c.http = http
    return c


def test_a_name_yahoo_has_no_fundamentals_for_returns_none_not_an_error():
    assert client_with(_Http(404, None)).fetch("NEW", "NEW.NS") is None
    assert client_with(_Http(200, {"quoteSummary": {"result": []}})).fetch("X", "X.NS") is None


def test_an_auth_failure_is_treated_as_no_data_rather_than_an_outage():
    """Yahoo answers 401 when the crumb is stale; that is not a dead source."""
    assert client_with(_Http(401, None)).fetch("X", "X.NS") is None


def test_a_server_error_is_an_outage():
    from desk.sources.http import SourceUnavailable

    with pytest.raises(SourceUnavailable):
        client_with(_Http(500, None)).fetch("X", "X.NS")


def test_an_html_error_page_is_not_mistaken_for_a_crumb():
    c = client_with(_Http(200, {"quoteSummary": {"result": [SAMPLE]}},
                          text="<html>error</html>"))
    c._prime()
    assert c._crumb is None


def test_debt_to_equity_is_converted_from_yahoos_percentage():
    """Regression: "D/E 11" read as 11x when Yahoo meant 0.11x."""
    f = _parse("COALINDIA", {"financialData": {"debtToEquity": wrapped(11.0)}})
    assert f.debt_to_equity == pytest.approx(0.11)


def test_an_implausible_growth_figure_is_dropped_rather_than_scored():
    """Petronet came back at -53% one run and +300% the next; past ±100% the
    number is far more often a Yahoo artefact than a real quarter."""
    assert _parse("X", {"financialData": {"revenueGrowth": wrapped(3.0)}}).revenue_growth_pct is None
    assert _parse("X", {"financialData": {"revenueGrowth": wrapped(-1.4)}}).revenue_growth_pct is None
    assert _parse("X", {"financialData": {"revenueGrowth": wrapped(0.3)}}).revenue_growth_pct == pytest.approx(30)
