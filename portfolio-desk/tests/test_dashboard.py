"""The rendered page must carry the provenance of its numbers."""

import json
import re

import pytest

from desk import dashboard, holdings as holdings_mod
from desk.market import MarketData, Price, SourceStatus
from desk.portfolio import analyse


def portfolio():
    return holdings_mod.load()


def market(tier="snapshot"):
    prices = json.loads((dashboard.config.DATA_DIR / "prices-snapshot.json").read_text())["prices"]
    return MarketData(
        prices={s: Price(symbol=s, last=p, tier=tier, as_of="2026-10-03") for s, p in prices.items()},
        statuses=[SourceStatus("yahoo (live prices)", "failed", "unreachable"),
                  SourceStatus("price snapshot", "stale", "last close 2026-10-03")],
    )


@pytest.fixture(scope="module")
def page():
    p = portfolio()
    m = market()
    return dashboard.render(dashboard.build_context(p, m, analyse(p, m)))


def test_stale_prices_are_announced_at_the_top(page):
    assert "Prices are not live." in page
    assert "2026-10-03" in page
    assert "not a live fetch" in page


def test_source_status_is_on_the_page(page):
    assert "yahoo (live prices)" in page and "failed" in page
    assert "price snapshot" in page and "stale" in page


def test_unavailable_sections_are_declared_not_hidden(page):
    """A section with no data says why, instead of quietly disappearing."""
    assert "Not available this run" in page
    assert "Index levels" in page
    assert "This morning&#39;s brief" in page or "This morning's brief" in page
    assert "Today&#39;s watchlist" in page or "Today's watchlist" in page


def test_the_disclaimer_is_present(page):
    assert "Reference only, not investment advice." in page


def test_every_holding_reaches_the_table(page):
    rows = json.loads(re.search(r'id="rows">(.*?)</script>', page, re.S).group(1).replace("<\\/", "</"))
    assert len(rows) == len(portfolio())
    by_name = {r["name"]: r for r in rows}
    # No cost basis: value and weight, but no P/L or return.
    page_ind = by_name["Page Industries"]
    assert page_ind["value"] is not None and page_ind["unreal"] is None and page_ind["ret"] is None
    # Unpriced: nothing at all, and flagged as such.
    sbi = by_name["State Bank of India"]
    assert sbi["value"] is None and sbi["weight"] is None and sbi["unpriced"] is True
    # Unlisted stays in the count.
    assert by_name["Bgse Properties & Securities"]["unlisted"] is True


def test_the_json_blob_cannot_close_the_script_tag():
    p = portfolio()
    m = market()
    context = dashboard.build_context(p, m, analyse(p, m))
    assert "</" not in context["rows_json"]


def test_live_prices_drop_the_stale_banner():
    p = portfolio()
    m = market(tier="live")
    page = dashboard.render(dashboard.build_context(p, m, analyse(p, m)))
    assert "Prices are not live." not in page
    assert "Prices fetched" in page


def test_build_writes_index_and_a_dated_archive(tmp_path):
    p = portfolio()
    m = market()
    result = dashboard.build(p, m, analyse(p, m), site_dir=tmp_path)
    assert result.index_path.exists() and result.archive_path.exists()
    assert result.index_path.read_text() == result.archive_path.read_text()
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}\.html", result.archive_path.name)
