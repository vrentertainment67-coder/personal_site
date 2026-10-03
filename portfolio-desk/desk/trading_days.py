"""Is the market open today?

NSE publishes its trading holidays once a year and changes them mid-year
(a muhurat session, a state funeral). So: fetch the live list, cache it to
`data/nse-holidays-<year>.json`, and fall back to that file when NSE cannot be
reached.

The shipped fallback holds only the fixed-date national holidays, which never
move. It is marked `verified: false` until a live fetch replaces it, and every
caller is told which of the two it is using — a guessed holiday list that skips
a real trading day is worse than running on a closed day, where the stale-data
banner already does its job.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from . import config
from .sources.http import SourceUnavailable
from .sources.nse_client import NseClient

# Fixed-date holidays, the only ones that can be known without NSE's calendar.
# Lunar-calendar festivals (Holi, Diwali, Eid, Dussehra…) move every year and
# are deliberately absent.
FIXED_HOLIDAYS = ((1, 26), (8, 15), (10, 2), (12, 25))


def holidays_path(year: int) -> Path:
    return config.DATA_DIR / f"nse-holidays-{year}.json"


@dataclass(frozen=True)
class Calendar:
    year: int
    dates: frozenset[str]
    verified: bool
    source: str

    def is_holiday(self, day: date) -> bool:
        return day.isoformat() in self.dates


@dataclass(frozen=True)
class DayStatus:
    day: date
    is_open: bool
    reason: str
    calendar_verified: bool


def fallback_calendar(year: int) -> Calendar:
    dates = {date(year, month, dom).isoformat() for month, dom in FIXED_HOLIDAYS}
    return Calendar(
        year=year,
        dates=frozenset(dates),
        verified=False,
        source="built-in fixed-date holidays only",
    )


def load(year: int, *, path: Path | None = None) -> Calendar:
    path = path or holidays_path(year)
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return fallback_calendar(year)
    dates = {str(d) for d in payload.get("dates") or []}
    if not dates:
        return fallback_calendar(year)
    return Calendar(
        year=year,
        dates=frozenset(dates),
        verified=bool(payload.get("verified")),
        source=str(payload.get("source") or str(path)),
    )


def save(calendar: Calendar, *, path: Path | None = None) -> Path:
    path = path or holidays_path(calendar.year)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            {
                "year": calendar.year,
                "verified": calendar.verified,
                "source": calendar.source,
                "fetched_at": date.today().isoformat(),
                "dates": sorted(calendar.dates),
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    return path


def refresh(year: int | None = None, *, client: NseClient | None = None) -> Calendar:
    """Fetch NSE's list and cache it. Falls back to the file when NSE is down."""
    year = year or date.today().year
    client = client or NseClient()
    try:
        dates = [d for d in client.trading_holidays() if d.startswith(str(year))]
    except SourceUnavailable:
        return load(year)
    if not dates:
        return load(year)
    calendar = Calendar(
        year=year, dates=frozenset(dates), verified=True, source="nseindia.com holiday-master"
    )
    save(calendar)
    return calendar


def status(day: date | None = None, *, calendar: Calendar | None = None) -> DayStatus:
    """Whether the market trades on `day`, and why not if it doesn't."""
    day = day or date.today()
    calendar = calendar or load(day.year)
    if day.weekday() >= 5:
        return DayStatus(day, False, "weekend", calendar.verified)
    if calendar.is_holiday(day):
        return DayStatus(day, False, f"NSE trading holiday ({calendar.source})", calendar.verified)
    reason = "trading day"
    if not calendar.verified:
        reason += " — holiday list unverified, only fixed-date holidays are known"
    return DayStatus(day, True, reason, calendar.verified)
