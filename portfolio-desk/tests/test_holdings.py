import json

import pytest

from desk import holdings as holdings_mod
from desk.holdings import HoldingsError


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


def doc(*rows):
    return {"as_of": "2026-10-03", "source": "test", "holdings": list(rows)}


def test_parses_a_minimal_document():
    portfolio = holdings_mod.parse(doc(row()))
    assert len(portfolio) == 1
    holding = portfolio.holdings[0]
    assert holding.nse_symbol == "RELIANCE"
    assert holding.is_listed
    assert holding.has_cost_basis
    assert holding.invested == pytest.approx(60 * 42.11)


def test_unlisted_row_is_counted_but_not_fetchable():
    portfolio = holdings_mod.parse(
        doc(row(), row(name="Bgse Properties", nse_symbol=None, yahoo_ticker=None, avg_cost=None))
    )
    assert len(portfolio) == 2
    assert [h.name for h in portfolio.unlisted] == ["Bgse Properties"]
    assert [h.name for h in portfolio.listed] == ["Reliance Industries"]


def test_missing_cost_basis_is_surfaced_not_rejected():
    portfolio = holdings_mod.parse(doc(row(avg_cost=None)))
    assert portfolio.holdings[0].invested is None
    assert [h.name for h in portfolio.missing_cost_basis] == ["Reliance Industries"]


def test_zero_avg_cost_is_rejected_because_null_means_unknown():
    with pytest.raises(HoldingsError, match="avg_cost must be positive or null"):
        holdings_mod.parse(doc(row(avg_cost=0)))


def test_rows_with_a_null_realized_pl_are_flagged_incomplete():
    portfolio = holdings_mod.parse(doc(row(name="State Bank of India", nse_symbol="SBIN",
                                           yahoo_ticker="SBIN.NS", realized_pl=None)))
    assert [h.name for h in portfolio.incomplete] == ["State Bank of India"]


def test_symbol_and_ticker_must_agree_on_listedness():
    with pytest.raises(HoldingsError, match="must both be set or both be null"):
        holdings_mod.parse(doc(row(yahoo_ticker=None)))


@pytest.mark.parametrize(
    "overrides, message",
    [
        ({"qty": 0}, "qty must be positive"),
        ({"qty": "sixty"}, "qty must be a number"),
        ({"verify_symbol": "yes"}, "verify_symbol must be true or false"),
        ({"sector": ""}, "sector must be a non-empty string"),
    ],
)
def test_bad_fields_are_rejected_with_the_holding_name(overrides, message):
    with pytest.raises(HoldingsError, match=message):
        holdings_mod.parse(doc(row(**overrides)))


def test_missing_and_unknown_fields_are_rejected():
    incomplete = row()
    del incomplete["sector"]
    with pytest.raises(HoldingsError, match="missing field"):
        holdings_mod.parse(doc(incomplete))
    with pytest.raises(HoldingsError, match="unexpected field"):
        holdings_mod.parse(doc(row(ltp=1234)))


def test_duplicates_are_rejected():
    with pytest.raises(HoldingsError, match="duplicate holding name"):
        holdings_mod.parse(doc(row(), row()))
    with pytest.raises(HoldingsError, match="duplicate nse_symbol"):
        holdings_mod.parse(doc(row(), row(name="Reliance (second lot)")))


def test_as_of_must_be_an_iso_date():
    bad = doc(row())
    bad["as_of"] = "03-10-2026"
    with pytest.raises(HoldingsError, match="as_of must be an ISO date"):
        holdings_mod.parse(bad)


def test_lookup_by_symbol_or_name_is_case_insensitive():
    portfolio = holdings_mod.parse(doc(row()))
    assert portfolio.find("reliance").name == "Reliance Industries"
    assert portfolio.find("reliance industries").nse_symbol == "RELIANCE"
    assert portfolio.find("nothing") is None


def test_save_round_trips(tmp_path):
    path = tmp_path / "holdings.json"
    path.write_text(json.dumps(doc(row())), encoding="utf-8")
    portfolio = holdings_mod.load(path)
    holdings_mod.save(portfolio)
    assert holdings_mod.load(path).to_dict() == portfolio.to_dict()


def test_load_reports_a_missing_file_clearly(tmp_path):
    with pytest.raises(HoldingsError, match="holdings file not found"):
        holdings_mod.load(tmp_path / "nope.json")


def test_load_reports_invalid_json_clearly(tmp_path):
    path = tmp_path / "holdings.json"
    path.write_text("{not json", encoding="utf-8")
    with pytest.raises(HoldingsError, match="not valid JSON"):
        holdings_mod.load(path)


def test_summary_covers_the_attention_lists():
    portfolio = holdings_mod.parse(
        doc(
            row(),
            row(name="LTM", nse_symbol="LTM", yahoo_ticker="LTM.NS", sector="IT", verify_symbol=True),
            row(name="Bgse Properties", nse_symbol=None, yahoo_ticker=None, sector="Unlisted", avg_cost=None),
        )
    )
    summary = holdings_mod.summarize(portfolio)
    assert summary.total_rows == 3
    assert summary.listed_rows == 2
    assert summary.needs_symbol_check == ["LTM"]
    assert summary.unlisted == ["Bgse Properties"]
    assert summary.missing_cost_basis == ["Bgse Properties"]


def test_the_real_holdings_file_is_valid():
    portfolio = holdings_mod.load()
    assert len(portfolio) == 41
    assert portfolio.by_symbol("SBIN") is not None
    # Bgse Properties is unlisted and must stay out of every fetch list.
    assert all(h.nse_symbol and h.yahoo_ticker for h in portfolio.listed)
    assert [h.name for h in portfolio.unlisted] == ["Bgse Properties & Securities"]
