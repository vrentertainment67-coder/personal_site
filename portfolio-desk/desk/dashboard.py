"""Render site/index.html (and a dated archive copy) from precomputed figures.

The template receives strings and flags only. Every rupee, percentage and
weight is computed in Python before it gets here; the page's JavaScript does
nothing but sort, filter and paint bars.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, select_autoescape

from . import config
from .format import DASH, compact, pct, qty, rupees
from .holdings import Portfolio, summarize
from .market import MarketData
from .portfolio import Analytics, Position

TEMPLATE_DIR = config.ROOT / "templates"
TEMPLATE_NAME = "dashboard.html.j2"

INDICES = [
    "NIFTY 50", "BANK NIFTY", "FINNIFTY", "MIDCPNIFTY", "SENSEX",
]


@dataclass
class BuildResult:
    index_path: Path
    archive_path: Path


def _row(position: Position, analytics: Analytics) -> dict[str, Any]:
    weight = analytics.weight_pct(position)
    return {
        "name": position.name,
        "sym": position.symbol or DASH,
        "sector": position.sector,
        "qty": position.qty,
        "qty_txt": qty(position.qty),
        "avg": position.avg_cost,
        "avg_txt": rupees(position.avg_cost),
        "price": position.last,
        "price_txt": rupees(position.last),
        "value": position.value,
        "value_txt": rupees(position.value),
        "weight": weight,
        "weight_txt": pct(weight, signed=False),
        "unreal": position.unrealised,
        "unreal_txt": rupees(position.unrealised),
        "ret": position.return_pct,
        "ret_txt": pct(position.return_pct),
        "tier": position.price_tier,
        "no_cost": position.avg_cost is None,
        "unlisted": not position.holding.is_listed,
        "unpriced": position.value is None,
        "guessed": position.holding.verify_symbol,
    }


def _flags(analytics: Analytics, portfolio: Portfolio) -> list[dict[str, str]]:
    flags: list[dict[str, str]] = []
    conc = analytics.concentration

    if conc:
        flags.append(
            {
                "tone": "warn",
                "title": f"Top 3 hold {pct(conc.top3_pct, 0, signed=False)} of the portfolio",
                "body": (
                    f"{', '.join(conc.top3_names)} together are worth "
                    f"{compact(conc.top3_value)}. A 10% fall across the three would cost about "
                    f"{compact(conc.top3_drawdown_10pct)}. Top 5 = "
                    f"{pct(conc.top5_pct, 0, signed=False)} ({compact(conc.top5_value)})."
                ),
            }
        )

    if analytics.no_cost_basis:
        names = ", ".join(p.name for p in analytics.no_cost_basis)
        flags.append(
            {
                "tone": "warn",
                "title": f"No cost basis on {len(analytics.no_cost_basis)} holdings",
                "body": (
                    f"{names}. The broker app shows an average cost of 0, usually bonus, "
                    "demerger or transferred shares. Their value counts towards the total, "
                    "but return and unrealised P/L are left blank rather than counting the "
                    "whole position as profit."
                ),
            }
        )

    losers = analytics.losers
    if losers:
        body = ", ".join(f"{p.name} {pct(p.return_pct)}" for p in losers)
        flags.append({"tone": "loss", "title": "Down more than 20%", "body": body + "."})

    if analytics.unpriced:
        names = ", ".join(
            f"{p.name} ({'unlisted' if not p.holding.is_listed else 'no price'})"
            for p in analytics.unpriced
        )
        flags.append(
            {
                "tone": "warn",
                "title": f"{len(analytics.unpriced)} holdings have no price",
                "body": f"{names}. They are excluded from the total value and from every weight.",
            }
        )

    guessed = portfolio.needs_symbol_check
    if guessed:
        flags.append(
            {
                "tone": "warn",
                "title": f"{len(guessed)} tickers still unverified",
                "body": (
                    f"{', '.join(h.name for h in guessed)}. The ticker was guessed from the "
                    "company name and could not be confirmed against Yahoo or NSE, so their "
                    "prices may belong to a different instrument."
                ),
            }
        )
    return flags


def build_context(
    portfolio: Portfolio, market: MarketData, analytics: Analytics
) -> dict[str, Any]:
    today = date.today()
    conc = analytics.concentration
    rows = [_row(p, analytics) for p in analytics.positions]
    priced_rows = sorted(
        (r for r in rows if r["value"] is not None), key=lambda r: r["value"], reverse=True
    )

    tiers = {r["tier"] for r in rows if r["tier"] != "none"}
    price_as_of = market.as_of
    if market.tier == "live":
        price_note = f"Prices fetched {price_as_of}."
    elif market.tier == "snapshot":
        price_note = (
            f"Prices are the last close of {price_as_of}, from the snapshot captured with "
            "your broker-app screenshots — not a live fetch."
        )
    else:
        price_note = "No price source could be reached, so values and weights are unavailable."

    headline = (
        f"Three stocks make up {pct(conc.top3_pct, 0, signed=False)} of your portfolio."
        if conc
        else "Prices are unavailable, so weights cannot be computed."
    )

    tiles = [
        {
            "label": f"Value{' (excl. unpriced)' if analytics.unpriced else ''}",
            "value": compact(analytics.total_value) if analytics.total_value else DASH,
            "tone": "",
            "note": f"{analytics.priced_count} of {len(rows)} rows priced",
        },
        {
            "label": "Unrealised P/L",
            "value": compact(analytics.unrealised),
            "tone": _tone(analytics.unrealised),
            "note": (
                f"on {analytics.measurable} rows with a cost basis "
                f"({pct(analytics.unrealised_pct)})"
            ),
        },
        {
            "label": "Realised to date",
            "value": compact(analytics.realised),
            "tone": _tone(analytics.realised),
            "note": "booked gains, from the broker app",
        },
        {
            "label": "In profit",
            "value": f"{analytics.in_profit} of {analytics.measurable}",
            "tone": "",
            "note": "measurable rows only",
        },
    ]
    if analytics.day_change_value is not None:
        tiles.insert(
            1,
            {
                "label": "Today",
                "value": compact(analytics.day_change_value),
                "tone": _tone(analytics.day_change_value),
                "note": "change since the previous close",
            },
        )

    max_sector = analytics.sectors[0].value if analytics.sectors else 0.0
    summary = summarize(portfolio)

    return {
        "generated_at": datetime.now().astimezone().strftime("%A %-d %B %Y, %H:%M %Z"),
        "today_long": today.strftime("%A %-d %B %Y"),
        "holdings_as_of": portfolio.as_of,
        "holdings_source": portfolio.source,
        "price_note": price_note,
        "price_tier": market.tier,
        "price_as_of": price_as_of or DASH,
        "stale": market.tier != "live",
        "headline": headline,
        "tiles": tiles,
        "strip": [
            {
                "name": r["name"],
                "short": r["name"].split(" (")[0].split(" &")[0],
                "sym": r["sym"],
                "value": r["value"],
                "weight": r["weight"],
                "weight_txt": r["weight_txt"],
                "value_txt": r["value_txt"],
                "top": i < 3,
            }
            for i, r in enumerate(priced_rows)
        ],
        "row_count": len(rows),
        "sectors": [
            {
                "name": s.name,
                "value_txt": compact(s.value),
                "weight_txt": pct(s.weight_pct, signed=False),
                "bar_pct": (s.value / max_sector * 100) if max_sector else 0,
                "count": s.count,
            }
            for s in analytics.sectors
        ],
        "flags": _flags(analytics, portfolio),
        "rows": rows,
        # `</` would end the <script> element early; escape it for the embed.
        "rows_json": json.dumps(rows, ensure_ascii=False).replace("</", "<\\/"),
        "sector_names": sorted({r["sector"] for r in rows}),
        "mixed_tiers": len(tiers) > 1,
        "statuses": [
            {"name": s.name, "health": s.health, "label": s.label, "detail": s.detail}
            for s in market.statuses
        ],
        "pending": [
            {
                "title": "Index levels",
                "body": (
                    "Pivots, CPR, DMAs, 52-week range and option-chain support/resistance for "
                    + ", ".join(INDICES)
                    + ". Needs the levels engine (step 3) and the NSE client (step 4)."
                ),
            },
            {
                "title": "Support and resistance per holding",
                "body": (
                    "Nearest zones and the distance to each, clustered from pivots, DMAs, "
                    "previous-day and previous-week extremes. Same two steps."
                ),
            },
            {
                "title": "This morning's brief",
                "body": (
                    "The written pre-market note, plus news touching your holdings. Needs the "
                    "news feeds (step 5) and the Claude call (step 6)."
                ),
            },
        ],
        "attention": {
            "missing_cost": summary.missing_cost_basis,
            "guessed": summary.needs_symbol_check,
            "incomplete": summary.incomplete,
            "unlisted": summary.unlisted,
        },
    }


def _tone(value: float | None) -> str:
    if value is None:
        return ""
    return "g" if value >= 0 else "l"


def render(context: dict[str, Any]) -> str:
    env = Environment(
        loader=FileSystemLoader(str(TEMPLATE_DIR)),
        autoescape=select_autoescape(["html"]),
        trim_blocks=True,
        lstrip_blocks=True,
    )
    return env.get_template(TEMPLATE_NAME).render(**context)


def build(
    portfolio: Portfolio,
    market: MarketData,
    analytics: Analytics,
    *,
    site_dir: Path | None = None,
) -> BuildResult:
    site_dir = site_dir or config.SITE_DIR
    archive_dir = site_dir / "archive"
    site_dir.mkdir(parents=True, exist_ok=True)
    archive_dir.mkdir(parents=True, exist_ok=True)

    html = render(build_context(portfolio, market, analytics))
    index_path = site_dir / "index.html"
    archive_path = archive_dir / f"{date.today().isoformat()}.html"
    index_path.write_text(html, encoding="utf-8")
    archive_path.write_text(html, encoding="utf-8")
    return BuildResult(index_path=index_path, archive_path=archive_path)
