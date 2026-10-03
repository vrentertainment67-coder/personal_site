"""Relative strength: whose fall is it?"""


from desk.relative import SECTOR_INDEX, compare, returns


def series(start, end, n=300):
    """A smooth path from start to end, long enough for every window."""
    step = (end / start) ** (1 / (n - 1))
    return [start * step ** i for i in range(n)]


def test_returns_cover_only_the_windows_the_series_can_support():
    assert returns(series(100, 200, 300)).keys() == {"1m", "3m", "12m"}
    assert returns(series(100, 200, 30)).keys() == {"1m"}
    assert returns([100, 101]) == {}


def test_a_stock_falling_with_its_sector_is_not_the_stocks_own_problem():
    rel = compare("INFY", "IT", series(1700, 1035), {
        "NIFTY IT": series(45000, 28000),      # sector fell about as hard
        "NIFTY 50": series(24000, 24800),
    })
    assert rel.sector_index == "NIFTY IT"
    assert abs(rel.vs_sector("3m")) < 3
    assert rel.verdict == "in line with its sector"
    assert "sector-wide" in rel.sentence()


def test_a_stock_falling_while_its_sector_holds_up_is_its_own_problem():
    rel = compare("X", "IT", series(1000, 600), {
        "NIFTY IT": series(45000, 45500),
        "NIFTY 50": series(24000, 24800),
    })
    assert rel.vs_sector("3m") < -10
    assert rel.verdict == "much worse than its sector"


def test_a_stock_beating_its_sector_is_reported_as_such():
    rel = compare("X", "Banks", series(100, 160), {
        "NIFTY BANK": series(50000, 52000),
        "NIFTY 50": series(24000, 24800),
    })
    assert rel.verdict in {"better than its sector", "much better than its sector"}


def test_a_sector_with_no_index_falls_back_to_the_market():
    rel = compare("ADANIENT", "Conglomerate", series(2000, 2800), {
        "NIFTY 50": series(24000, 24800),
    })
    assert rel.sector_index is None
    assert rel.vs_sector("3m") is None
    assert rel.vs_market("3m") is not None
    assert "no sector index for Conglomerate" in rel.sentence()


def test_no_index_data_at_all_still_reports_the_stocks_own_move():
    rel = compare("X", "IT", series(100, 150), {})
    assert rel.verdict == "unknown"
    assert "+" in rel.sentence()


def test_too_little_history_yields_nothing_rather_than_a_guess():
    assert compare("X", "IT", [100, 101], {"NIFTY IT": series(100, 110)}) is None


def test_every_mapped_sector_points_at_a_real_nifty_index():
    from desk.market import SECTOR_INDEX_TICKERS

    for sector, index in SECTOR_INDEX.items():
        assert index in SECTOR_INDEX_TICKERS, f"{sector} maps to an index with no ticker"


def test_the_holdings_file_sectors_are_mostly_mapped():
    """A sector with no index is allowed, but it should be a deliberate few."""
    from desk import holdings as holdings_mod

    sectors = {h.sector for h in holdings_mod.load()}
    unmapped = sectors - set(SECTOR_INDEX)
    assert unmapped <= {
        "Conglomerate", "Consumer Tech", "Telecom", "Textiles & Apparel", "Unlisted",
    }, f"unexpected unmapped sectors: {unmapped}"
