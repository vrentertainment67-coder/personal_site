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
INDEX_NAMES = frozenset({"NIFTY 50", "BANK NIFTY", "SENSEX"})


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


def _flags(
    analytics: Analytics, portfolio: Portfolio, *, skip_concentration: bool = False
) -> list[dict[str, str]]:
    """Panel items. `skip_concentration` avoids repeating what the signal
    engine already says when a full run supplied portfolio notes."""
    flags: list[dict[str, str]] = []
    conc = analytics.concentration

    if conc and not skip_concentration:
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


def _index_cards(run: Any) -> list[dict[str, Any]]:
    """One card per index: price on a ruler between its nearest zones."""
    if run is None:
        return []
    cards = []
    for name, ls in getattr(run, "levels", {}).items():
        if name not in INDEX_NAMES:
            continue
        support = ls.nearest_support()
        resistance = ls.nearest_resistance()
        if not support or not resistance:
            continue
        span = resistance.center - support.center
        position = ((ls.last - support.center) / span * 100) if span else 50
        cards.append({
            "name": name,
            "last": f"{ls.last:,.0f}",
            "change": pct(ls.day_change_pct),
            "change_tone": _tone(ls.day_change_pct),
            "support": f"{support.center:,.0f}",
            "support_methods": ", ".join(support.methods),
            "support_dist": pct(support.distance_pct(ls.last)),
            "resistance": f"{resistance.center:,.0f}",
            "resistance_methods": ", ".join(resistance.methods),
            "resistance_dist": pct(resistance.distance_pct(ls.last)),
            "marker_pct": max(2.0, min(98.0, position)),
            "cpr": ls.cpr.shape if ls.cpr else None,
            "cpr_width": pct(ls.cpr.width_pct, 2, signed=False) if ls.cpr else None,
            "pcr": f"{ls.pcr:.2f}" if ls.pcr else None,
            "max_pain": f"{ls.max_pain:,.0f}" if ls.max_pain else None,
            # Shown in their own right: the OI walls are often outside the
            # nearest zone, and they are the levels option traders watch.
            "put_oi": f"{ls.oi_support:,.0f}" if ls.oi_support else None,
            "call_oi": f"{ls.oi_resistance:,.0f}" if ls.oi_resistance else None,
        })
    return cards


def _ratings(run: Any) -> list[dict[str, Any]]:
    rows = []
    for rating in getattr(run, "ratings", []):
        flips = getattr(rating, "flip_levels", {}) or {}
        rows.append({
            "name": rating.name,
            "symbol": rating.position.symbol or DASH,
            "verdict": rating.verdict.value,
            "tone": rating.verdict.tone,
            "score": f"{rating.score:+.2f}",
            "confidence": rating.confidence,
            "last": rupees(rating.position.last),
            "reasons": rating.reasons,
            "caveats": rating.caveats,
            "flips": [f"{label} at {price:,.2f}" for label, price in flips.items()],
        })
    return rows


def _watchlist(run: Any) -> list[dict[str, Any]]:
    if run is None:
        return []
    rows = []
    for item in getattr(run, "watchlist", []):
        position = item.position
        rows.append({
            "name": position.name,
            "symbol": position.symbol or DASH,
            "weight": pct(item.weight_pct, signed=False) if item.weight_pct else DASH,
            "last": rupees(position.last),
            "change": pct(position.day_change_pct),
            "change_tone": _tone(position.day_change_pct),
            "score": f"{item.score:.1f}",
            "reasons": [
                {"text": s.text, "tone": s.tone}
                for s in sorted(item.signals, key=lambda s: -s.weight)
            ],
        })
    return rows


def build_context(
    portfolio: Portfolio, market: MarketData, analytics: Analytics, run: Any = None
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

    index_cards = _index_cards(run)
    watchlist = _watchlist(run)
    ratings = _ratings(run)
    rating_tally: dict[str, int] = {}
    for row in ratings:
        rating_tally[row["verdict"]] = rating_tally.get(row["verdict"], 0) + 1

    # The three columns of the Calls tab, in the order a human reads them.
    calls = [
        {
            "verdict": verdict,
            "tone": tone,
            "count": rating_tally.get(verdict, 0),
            "names": [r for r in ratings if r["verdict"] == verdict],
        }
        for verdict, tone in (("Buy", "good"), ("Keep", "neutral"), ("Sell", "bad"))
    ]
    no_rating = [
        {
            "name": r.name,
            "symbol": r.position.symbol or DASH,
            "why": r.caveats[0] if r.caveats else "not enough data",
        }
        for r in getattr(run, "ratings", [])
        if r.verdict.value == "No rating"
    ]
    portfolio_notes = [
        {"headline": s.headline, "detail": s.detail, "tone": s.tone}
        for s in getattr(run, "portfolio_signals", [])
    ]

    brief_result = getattr(run, "brief", None)
    brief_block = None
    if brief_result is not None:
        brief_block = {
            "ok": brief_result.ok,
            "text": brief_result.text,
            "paragraphs": _paragraphs(brief_result.text) if brief_result.text else [],
            "model": brief_result.model,
            "failure": brief_result.failure,
            "rejected_numbers": brief_result.rejected_numbers,
        }

    news_rows = [
        {"symbol": symbol, "title": item.get("title"), "source": item.get("source")}
        for symbol, items in (getattr(run, "news", {}) or {}).items()
        for item in items
    ]

    pending = []
    if not index_cards:
        pending.append({
            "title": "Index levels",
            "body": (
                "Pivots, CPR, DMAs, 52-week range and option-chain support/resistance for "
                + ", ".join(INDICES)
                + ". Needs a reachable Yahoo and NSE."
            ),
        })
    if not watchlist:
        pending.append({
            "title": "Today's watchlist",
            "body": (
                "Holdings near a zone, crossing a DMA, at a 52-week extreme or carrying news. "
                "Needs daily history, which needs Yahoo."
            ),
        })
    if brief_block is None or not brief_block["ok"]:
        reason = (
            brief_block["failure"] if brief_block and brief_block["failure"]
            else "not generated on this run"
        )
        pending.append({"title": "This morning's brief", "body": f"Unavailable — {reason}."})

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
        "flags": _flags(analytics, portfolio, skip_concentration=bool(portfolio_notes)),
        "rows": rows,
        # `</` would end the <script> element early; escape it for the embed.
        "rows_json": json.dumps(rows, ensure_ascii=False).replace("</", "<\\/"),
        "sector_names": sorted({r["sector"] for r in rows}),
        "mixed_tiers": len(tiers) > 1,
        "statuses": [
            {"name": s.name, "health": s.health, "label": s.label, "detail": s.detail}
            for s in market.statuses
        ],
        "indices": index_cards,
        "watchlist": watchlist,
        "ratings": ratings,
        "rating_tally": rating_tally,
        "calls": calls,
        "no_rating": no_rating,
        "portfolio_notes": portfolio_notes,
        "brief": brief_block,  # None when the run did not generate one
        "news": news_rows,
        "pending": pending,
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


def _paragraphs(text: str) -> list[dict[str, Any]]:
    """Split the brief into its headed sections for the panel."""
    out: list[dict[str, Any]] = []
    for block in [b.strip() for b in text.split("\n\n") if b.strip()]:
        heading, _, body = block.partition("\n")
        clean = heading.strip().strip("*#").strip()
        if body.strip() and len(clean) < 60:
            out.append({"heading": clean, "body": body.strip()})
        else:
            out.append({"heading": None, "body": block})
    return out


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
    run: Any = None,
    site_dir: Path | None = None,
) -> BuildResult:
    site_dir = site_dir or config.SITE_DIR
    archive_dir = site_dir / "archive"
    site_dir.mkdir(parents=True, exist_ok=True)
    archive_dir.mkdir(parents=True, exist_ok=True)

    html = render(build_context(portfolio, market, analytics, run))
    index_path = site_dir / "index.html"
    archive_path = archive_dir / f"{date.today().isoformat()}.html"
    index_path.write_text(html, encoding="utf-8")
    archive_path.write_text(html, encoding="utf-8")
    return BuildResult(index_path=index_path, archive_path=archive_path)
