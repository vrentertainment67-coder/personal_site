"""The payload Claude receives, and the panels the page grows when data exists."""

from datetime import date, timedelta

import pytest

from desk import dashboard, holdings as holdings_mod, levels as levels_mod, run as run_mod
from desk.brief import BriefResult
from desk.levels import Bar
from desk.market import MarketData, Price, SourceStatus
from desk.portfolio import analyse
from desk.signals import rank, portfolio_signals


def bars(closes, *, spread=4.0, start=date(2026, 1, 1)):
    out, day = [], start
    for c in closes:
        out.append(Bar(day=day, open=c, high=c + spread, low=c - spread, close=c, volume=1000))
        day += timedelta(days=1)
    return out


def portfolio():
    return holdings_mod.parse({
        "as_of": "2026-10-03", "source": "test",
        "holdings": [
            {"name": "Infosys", "nse_symbol": "INFY", "yahoo_ticker": "INFY.NS", "sector": "IT",
             "qty": 210, "avg_cost": 307.01, "realized_pl": 42420, "verify_symbol": False,
             "notes": None},
            {"name": "Canara Bank", "nse_symbol": "CANBK", "yahoo_ticker": "CANBK.NS",
             "sector": "Banks", "qty": 2600, "avg_cost": 46.25, "realized_pl": 38620,
             "verify_symbol": False, "notes": None},
        ],
    })


def built_run(*, with_brief=True):
    p = portfolio()
    market = MarketData(
        prices={
            "INFY": Price("INFY", 1035.0, "live", "2026-10-05", prev_close=1002.0),
            "CANBK": Price("CANBK", 118.5, "live", "2026-10-05", prev_close=117.9),
        },
        statuses=[SourceStatus("yahoo (live prices)", "ok", "2 of 2 quoted")],
    )
    analytics = analyse(p, market)
    lv = {
        "INFY": levels_mod.build("INFY", bars(list(range(800, 1060))), last=1035.0),
        "CANBK": levels_mod.build("CANBK", bars([100 + i * 0.1 for i in range(260)]), last=118.5),
        "NIFTY 50": levels_mod.build(
            "NIFTY 50", bars(list(range(24000, 24900, 4))), last=24853.15, is_index=True,
            oi_support=24700, oi_resistance=25000, pcr=1.08, max_pain=24800,
        ),
    }
    result = run_mod.RunResult(day=date(2026, 10, 5), traded=True, reason="trading day",
                               portfolio=p, analytics=analytics, market=market, levels=lv)
    result.watchlist = rank(analytics, lv, news={"INFY": 2})
    result.portfolio_signals = portfolio_signals(analytics)
    result.news = {"INFY": [{"title": "Infosys wins a cloud deal", "source": "Economic Times",
                             "published": None}]}
    result.vix = 11.4
    result.globals_ = [{"name": "S&P 500", "last": 6123.4, "change_pct": 0.42}]
    if with_brief:
        result.brief = BriefResult(
            text="**Mood**\nGlobal cues are quiet.\n\n**Nifty**\nSupport sits at 24,700.",
            model="claude-opus-5-5", attempts=1, ok=True,
        )
    return result


# ------------------------------------------------------------------ payload


def test_the_payload_carries_only_precomputed_figures():
    payload = run_mod.build_payload(built_run())
    assert payload["as_of"] == "2026-10-05"
    assert payload["portfolio"]["value"] == pytest.approx(1035 * 210 + 118.5 * 2600)
    nifty = next(i for i in payload["indices"] if i["name"] == "NIFTY 50")
    assert nifty["last"] == 24853.15
    assert nifty["supports"] and "methods" in nifty["supports"][0]
    assert nifty["pcr"] == 1.08


def test_the_payload_lists_what_was_unavailable():
    result = built_run()
    result.unavailable = ["India VIX", "news"]
    assert run_mod.build_payload(result)["unavailable"] == ["India VIX", "news"]


def test_watchlist_reasons_reach_the_payload_verbatim():
    result = built_run()
    payload = run_mod.build_payload(result)
    assert payload["watchlist"]
    first = payload["watchlist"][0]
    assert first["reasons"] == result.watchlist[0].reasons


def test_every_number_in_a_brief_drawn_from_the_payload_validates():
    """The guard must not reject figures the payload genuinely contains."""
    from desk.numbers import unsupported

    payload = run_mod.build_payload(built_run())
    nifty = next(i for i in payload["indices"] if i["name"] == "NIFTY 50")
    text = (
        f"Nifty closed at {nifty['last']:,}. Its nearest support is "
        f"{nifty['supports'][0]['center']:,.0f} and PCR is {nifty['pcr']}."
    )
    assert unsupported(text, payload) == []


# ---------------------------------------------------------------- dashboard


@pytest.fixture(scope="module")
def live_page():
    result = built_run()
    return dashboard.render(
        dashboard.build_context(result.portfolio, result.market, result.analytics, result)
    )


def test_the_brief_panel_renders_with_its_provenance(live_page):
    assert "This morning" in live_page
    assert "Support sits at 24,700." in live_page
    assert "checked back against that data" in live_page
    assert "not investment advice" in live_page


def test_index_cards_show_both_zones_and_the_methods_behind_them(live_page):
    assert "Index levels" in live_page
    assert "NIFTY 50" in live_page
    assert "highest put OI" in live_page or "highest call OI" in live_page
    assert "max pain" in live_page


def test_the_watchlist_lists_its_reasons(live_page):
    assert "Worth your attention today" in live_page
    assert "news item" in live_page
    assert "no recommendations" in live_page.lower()


def test_news_is_attributed(live_page):
    assert "Infosys wins a cloud deal" in live_page
    assert "Economic Times" in live_page


def test_sections_with_data_are_not_listed_as_unavailable(live_page):
    assert "Not available this run" not in live_page


def test_a_failed_brief_is_declared_on_the_page():
    result = built_run(with_brief=False)
    result.brief = BriefResult(text=None, model="claude-opus-5-5", attempts=2, ok=False,
                               failure="failed number validation on every attempt",
                               rejected_numbers=["24,612"])
    page = dashboard.render(
        dashboard.build_context(result.portfolio, result.market, result.analytics, result)
    )
    assert "Not available this run" in page
    assert "failed number validation" in page
    assert "24,612" not in page      # the bad draft is never shown


def test_the_days_levels_are_written_for_later_checking(tmp_path, monkeypatch):
    import json

    monkeypatch.setattr(run_mod.config, "LEVELS_DIR", tmp_path)
    result = built_run()
    path = run_mod.save_levels(result)
    payload = json.loads(path.read_text())
    assert path.name == "2026-10-05.json"
    assert set(payload["instruments"]) == {"INFY", "CANBK", "NIFTY 50"}
    nifty = payload["instruments"]["NIFTY 50"]
    assert nifty["pcr"] == 1.08 and nifty["zones"]
    assert nifty["cpr"]["shape"] in {"narrow", "average", "wide"}


# ------------------------------------------------- source-sweep robustness


class _Yahoo:
    """History for some tickers, 404 for others, outage for the rest."""

    source = "yahoo"

    def __init__(self, series, dead=(), down=()):
        self.series, self.dead, self.down = series, set(dead), set(down)
        self.asked = []

    def history(self, ticker, period="1y"):
        from desk.sources.http import SourceUnavailable

        self.asked.append(ticker)
        if ticker in self.down:
            raise SourceUnavailable("yahoo", "connection reset")
        if ticker in self.dead:
            return []                     # Yahoo answered: no such ticker
        return self.series


def test_one_dead_ticker_does_not_cost_every_later_holding_its_history():
    """Regression: the sweep aborted on the first failure, so LML.NS silently
    took the 17 names after it with it."""
    from desk import market as market_mod

    tickers = {"A": "A.NS", "DEAD": "DEAD.NS", "B": "B.NS", "C": "C.NS"}
    client = _Yahoo(bars([100, 101, 102]), dead={"DEAD.NS"})
    got, status = market_mod.fetch_bars(tickers, client=client)

    assert set(got) == {"A", "B", "C"}
    assert client.asked == ["A.NS", "DEAD.NS", "B.NS", "C.NS"]
    assert status.health == "ok"
    assert "no history for DEAD" in status.detail


def test_the_sweep_gives_up_only_once_the_source_stops_answering():
    from desk import market as market_mod

    tickers = {chr(65 + i): f"{chr(65 + i)}.NS" for i in range(8)}
    client = _Yahoo(bars([100, 101]), down={f"{chr(65 + i)}.NS" for i in range(8)})
    got, status = market_mod.fetch_bars(tickers, client=client)

    assert got == {}
    assert status.health == "failed"
    assert len(client.asked) == market_mod.MAX_CONSECUTIVE_FAILURES
    assert "gave up" in status.detail


def test_an_intermittent_failure_does_not_end_the_sweep():
    from desk import market as market_mod

    tickers = {"A": "A.NS", "X": "X.NS", "B": "B.NS", "Y": "Y.NS", "C": "C.NS"}
    client = _Yahoo(bars([100, 101]), down={"X.NS", "Y.NS"})
    got, status = market_mod.fetch_bars(tickers, client=client)

    assert set(got) == {"A", "B", "C"}
    assert status.health == "ok"
