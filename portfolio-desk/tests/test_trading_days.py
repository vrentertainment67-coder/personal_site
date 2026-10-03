from datetime import date

from desk import trading_days


def test_weekends_are_closed():
    assert trading_days.status(date(2026, 10, 3)).is_open is False   # Saturday
    assert trading_days.status(date(2026, 10, 4)).reason == "weekend"


def test_fixed_date_holidays_are_known_without_nse():
    cal = trading_days.fallback_calendar(2026)
    assert cal.is_holiday(date(2026, 1, 26))      # Republic Day
    assert cal.is_holiday(date(2026, 8, 15))      # Independence Day
    assert cal.verified is False


def test_a_weekday_is_open_but_flagged_while_the_list_is_unverified():
    st = trading_days.status(date(2026, 10, 6), calendar=trading_days.fallback_calendar(2026))
    assert st.is_open is True
    assert st.calendar_verified is False
    assert "unverified" in st.reason


def test_a_verified_calendar_round_trips(tmp_path):
    cal = trading_days.Calendar(2026, frozenset({"2026-03-04"}), True, "nseindia.com")
    path = trading_days.save(cal, path=tmp_path / "h.json")
    loaded = trading_days.load(2026, path=path)
    assert loaded.verified is True
    assert loaded.is_holiday(date(2026, 3, 4))
    assert trading_days.status(date(2026, 3, 4), calendar=loaded).is_open is False


def test_a_missing_or_empty_file_falls_back(tmp_path):
    assert trading_days.load(2026, path=tmp_path / "nope.json").verified is False
    (tmp_path / "empty.json").write_text('{"dates": []}')
    assert trading_days.load(2026, path=tmp_path / "empty.json").verified is False


def test_refresh_keeps_the_cached_list_when_nse_is_down():
    class DownClient:
        def trading_holidays(self):
            from desk.sources.http import SourceUnavailable
            raise SourceUnavailable("nse", "blocked")

    cal = trading_days.refresh(2026, client=DownClient())
    assert cal.verified is False      # fell back, and says so


def test_refresh_stores_what_nse_returns(tmp_path, monkeypatch):
    monkeypatch.setattr(trading_days.config, "DATA_DIR", tmp_path)

    class Client:
        def trading_holidays(self):
            return ["2026-01-26", "2026-03-04", "2025-12-25"]

    cal = trading_days.refresh(2026, client=Client())
    assert cal.verified is True
    assert "2025-12-25" not in cal.dates          # other years are dropped
    assert trading_days.load(2026, path=tmp_path / "nse-holidays-2026.json").verified
