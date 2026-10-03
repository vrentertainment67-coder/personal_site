"""Verification logic, exercised with fake sources (no network)."""

import pytest

from desk import holdings as holdings_mod
from desk.sources.http import SourceUnavailable
from desk.sources.nse_client import EquityInfo
from desk.sources.yahoo import Match, Quote
from desk.verify import Status, verify_holding, verify_portfolio


def row(**overrides):
    base = {
        "name": "Reliance Industries",
        "nse_symbol": "RELIANCE",
        "yahoo_ticker": "RELIANCE.NS",
        "sector": "Oil & Gas",
        "qty": 60,
        "avg_cost": 42.11,
        "realized_pl": 1710,
        "verify_symbol": False,
        "notes": None,
    }
    base.update(overrides)
    return base


def portfolio_of(*rows):
    return holdings_mod.parse({"as_of": "2026-10-03", "source": "test", "holdings": list(rows)})


def one(**overrides):
    return portfolio_of(row(**overrides)).holdings[0]


class FakeYahoo:
    """Quotes keyed by ticker: a Quote, None (not found), or an exception."""

    source = "yahoo"

    def __init__(self, quotes=None, matches=None):
        self.quotes = quotes or {}
        self.matches = matches or {}
        self.failures = []
        self.asked = []

    def quote(self, ticker):
        self.asked.append(ticker)
        result = self.quotes.get(ticker, None)
        if isinstance(result, Exception):
            self.failures.append(f"chart/{ticker}: boom")
            raise result
        return result

    def search(self, query, limit=6):
        return self.matches.get(query, [])


class FakeNse:
    source = "nse"

    def __init__(self, symbols=None, down=False):
        self.symbols = symbols or {}
        self.down = down
        self.failures = []
        self.asked = []

    def equity_info(self, symbol):
        self.asked.append(symbol)
        if self.down:
            self.failures.append(f"quote-equity/{symbol}: boom")
            raise SourceUnavailable("nse", "connection refused")
        return self.symbols.get(symbol)

    def search(self, query, limit=6):
        return []


def quote(ticker="RELIANCE.NS", price=1420.5):
    return Quote(ticker=ticker, name="Reliance Industries Ltd", exchange="NSE",
                 currency="INR", last_price=price)


def test_a_resolving_ticker_is_ok():
    result = verify_holding(one(), yahoo=FakeYahoo({"RELIANCE.NS": quote()}), nse=FakeNse())
    assert result.status is Status.OK
    assert result.checked_with == "yahoo"
    assert result.last_price == pytest.approx(1420.5)


def test_an_unknown_ticker_is_bad_with_suggestions():
    yahoo = FakeYahoo(
        quotes={"LTM.NS": None},
        matches={"LTM": [Match(symbol="LTIM.NS", name="LTIMindtree Limited",
                               exchange="NSE", quote_type="EQUITY")]},
    )
    result = verify_holding(
        one(name="LTM", nse_symbol="LTM", yahoo_ticker="LTM.NS", verify_symbol=True),
        yahoo=yahoo,
        nse=FakeNse(),
    )
    assert result.status is Status.BAD
    assert result.suggestions == ["LTIM.NS (LTIMindtree Limited, NSE)"]


def test_a_source_that_cannot_be_reached_never_condemns_a_ticker():
    """The whole point: network down must read UNKNOWN, not BAD."""
    yahoo = FakeYahoo({"RELIANCE.NS": SourceUnavailable("yahoo", "CONNECT tunnel failed")})
    result = verify_holding(one(), yahoo=yahoo, nse=FakeNse(down=True))
    assert result.status is Status.UNKNOWN
    assert "unavailable" in result.detail


def test_nse_is_used_when_yahoo_has_no_such_ticker():
    """Newly listed names show up on NSE before Yahoo."""
    yahoo = FakeYahoo({"TATACAP.NS": None})
    nse = FakeNse({"TATACAP": EquityInfo("TATACAP", "Tata Capital Limited", "EQ", False)})
    result = verify_holding(
        one(name="Tata Capital", nse_symbol="TATACAP", yahoo_ticker="TATACAP.NS", verify_symbol=True),
        yahoo=yahoo,
        nse=nse,
    )
    assert result.status is Status.OK
    assert result.checked_with == "nse"


def test_nse_rescues_a_row_when_yahoo_is_unreachable():
    yahoo = FakeYahoo({"SBIN.NS": SourceUnavailable("yahoo", "timeout")})
    nse = FakeNse({"SBIN": EquityInfo("SBIN", "State Bank of India", "EQ", True)})
    result = verify_holding(
        one(name="State Bank of India", nse_symbol="SBIN", yahoo_ticker="SBIN.NS"),
        yahoo=yahoo,
        nse=nse,
    )
    assert result.status is Status.OK
    assert result.checked_with == "nse"


def test_unlisted_holdings_are_skipped_and_never_fetched():
    yahoo = FakeYahoo()
    result = verify_holding(
        one(name="Bgse Properties", nse_symbol=None, yahoo_ticker=None,
            sector="Unlisted", avg_cost=None, notes="Unlisted; exclude from price fetch"),
        yahoo=yahoo,
        nse=FakeNse(),
    )
    assert result.status is Status.SKIPPED
    assert yahoo.asked == []


def test_report_blocks_on_a_bad_ticker():
    portfolio = portfolio_of(
        row(),
        row(name="LML", nse_symbol="LML", yahoo_ticker="LML.NS", verify_symbol=True),
    )
    report = verify_portfolio(
        portfolio,
        yahoo=FakeYahoo({"RELIANCE.NS": quote(), "LML.NS": None}),
        nse=FakeNse(),
    )
    assert [r.name for r in report.bad] == ["LML"]
    assert report.blocked is True
    assert report.all_sources_down is False


def test_report_blocks_when_a_guessed_ticker_could_not_be_checked():
    portfolio = portfolio_of(
        row(),
        row(name="NSE", nse_symbol="NSE", yahoo_ticker="NSE.NS", verify_symbol=True),
    )
    report = verify_portfolio(
        portfolio,
        yahoo=FakeYahoo({"RELIANCE.NS": quote(),
                         "NSE.NS": SourceUnavailable("yahoo", "403")}),
        nse=FakeNse(down=True),
    )
    assert [r.name for r in report.unverified_flagged] == ["NSE"]
    assert report.blocked is True


def test_report_does_not_block_on_an_unverified_unflagged_row():
    """A trusted ticker that happened to miss one source is not a reason to stop."""
    report = verify_portfolio(
        portfolio_of(row(), row(name="TCS", nse_symbol="TCS", yahoo_ticker="TCS.NS")),
        yahoo=FakeYahoo({"RELIANCE.NS": quote(), "TCS.NS": SourceUnavailable("yahoo", "timeout")}),
        nse=FakeNse(down=True),
    )
    assert [r.name for r in report.unknown] == ["TCS"]
    assert report.blocked is False


def test_all_sources_down_is_reported_separately():
    report = verify_portfolio(
        portfolio_of(row()),
        yahoo=FakeYahoo({"RELIANCE.NS": SourceUnavailable("yahoo", "CONNECT tunnel failed")}),
        nse=FakeNse(down=True),
    )
    assert report.all_sources_down is True
    assert report.source_failures["yahoo"]
    assert report.source_failures["nse"]


def test_only_flagged_checks_just_the_guessed_rows():
    portfolio = portfolio_of(
        row(),
        row(name="Hyundai Motor India", nse_symbol="HYUNDAI", yahoo_ticker="HYUNDAI.NS",
            verify_symbol=True),
    )
    yahoo = FakeYahoo({"HYUNDAI.NS": quote("HYUNDAI.NS", 2415.0)})
    report = verify_portfolio(portfolio, yahoo=yahoo, nse=FakeNse(), only_flagged=True)
    assert yahoo.asked == ["HYUNDAI.NS"]
    assert [r.name for r in report.ok] == ["Hyundai Motor India"]
