"""Command line: `python -m desk holdings|verify-symbols|run`."""

from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import date
from pathlib import Path

from . import config, holdings as holdings_mod
from .format import compact, inr
from .holdings import Holding, HoldingsError, Portfolio
from .verify import Report, verify_portfolio

EXIT_OK = 0
EXIT_USAGE = 2
EXIT_BAD_DATA = 3
EXIT_NEEDS_FIX = 4  # symbols need correcting, or could not be verified
EXIT_SOURCES_DOWN = 5


# ---------------------------------------------------------------- formatting


def _table(headers: list[str], rows: list[list[str]]) -> str:
    if not rows:
        return ""
    widths = [len(h) for h in headers]
    for row in rows:
        for i, cell in enumerate(row):
            widths[i] = max(widths[i], len(cell))
    line = "  ".join(h.ljust(widths[i]) for i, h in enumerate(headers)).rstrip()
    rule = "  ".join("-" * widths[i] for i in range(len(headers)))
    body = [
        "  ".join(cell.ljust(widths[i]) for i, cell in enumerate(row)).rstrip() for row in rows
    ]
    return "\n".join([line, rule, *body])


def _bullets(title: str, items: list[str]) -> str:
    if not items:
        return ""
    return "\n".join([f"{title} ({len(items)}):", *(f"  - {i}" for i in items)])


# ------------------------------------------------------------------ holdings


def _load(path: Path | None) -> Portfolio:
    try:
        return holdings_mod.load(path)
    except HoldingsError as exc:
        print(f"holdings.json is not usable: {exc}", file=sys.stderr)
        raise SystemExit(EXIT_BAD_DATA)


def cmd_holdings_list(args: argparse.Namespace) -> int:
    portfolio = _load(args.file)
    summary = holdings_mod.summarize(portfolio)

    if args.json:
        print(json.dumps(portfolio.to_dict(), indent=2, ensure_ascii=False))
        return EXIT_OK

    rows = []
    for h in portfolio:
        invested = h.invested
        rows.append(
            [
                h.name,
                h.nse_symbol or "—",
                h.sector,
                f"{h.qty:g}",
                inr(h.avg_cost) if h.avg_cost is not None else "missing",
                inr(invested) if invested is not None else "—",
                "verify" if h.verify_symbol else ("unlisted" if not h.is_listed else ""),
            ]
        )
    print(f"holdings.json — as of {portfolio.as_of} ({portfolio.source})\n")
    print(_table(["Name", "Symbol", "Sector", "Qty", "Avg cost", "Invested", "Flag"], rows))

    invested_total = sum(h.invested or 0.0 for h in portfolio)
    print(
        f"\n{summary.total_rows} holdings, {summary.listed_rows} listed. "
        f"Known cost basis on {summary.total_rows - len(summary.missing_cost_basis)} rows "
        f"= {inr(invested_total)} invested."
    )
    for block in (
        _bullets("Unlisted (counted, never fetched)", summary.unlisted),
        _bullets("Ticker guessed — run verify-symbols", summary.needs_symbol_check),
        _bullets("Cost basis missing — no return % will be shown", summary.missing_cost_basis),
        _bullets("Incomplete row — confirm against the broker app", summary.incomplete),
    ):
        if block:
            print("\n" + block)
    return EXIT_OK


def cmd_holdings_add(args: argparse.Namespace) -> int:
    portfolio = _load(args.file)
    if portfolio.find(args.name) is not None:
        print(f"{args.name!r} is already in holdings.json; use `holdings update`.", file=sys.stderr)
        return EXIT_USAGE

    nse_symbol = args.nse_symbol.upper() if args.nse_symbol else None
    yahoo_ticker = args.yahoo_ticker or (f"{nse_symbol}.NS" if nse_symbol else None)
    holding = Holding(
        name=args.name,
        nse_symbol=nse_symbol,
        yahoo_ticker=yahoo_ticker,
        sector=args.sector,
        qty=args.qty,
        avg_cost=args.avg_cost,
        realized_pl=args.realized_pl,
        verify_symbol=args.verify_symbol or (args.yahoo_ticker is None and nse_symbol is not None),
        notes=args.notes,
    )
    updated = holdings_mod.replace_holdings(portfolio, [*portfolio.holdings, holding])
    path = holdings_mod.save(updated)
    print(f"Added {holding.name} ({holding.nse_symbol or 'unlisted'}) to {path}")
    if holding.verify_symbol:
        print("Marked verify_symbol: true — run `python -m desk verify-symbols` before the next brief.")
    return EXIT_OK


def cmd_holdings_remove(args: argparse.Namespace) -> int:
    portfolio = _load(args.file)
    holding = portfolio.find(args.name)
    if holding is None:
        print(f"No holding matches {args.name!r}.", file=sys.stderr)
        return EXIT_USAGE
    updated = holdings_mod.replace_holdings(
        portfolio, [h for h in portfolio.holdings if h is not holding]
    )
    path = holdings_mod.save(updated)
    print(f"Removed {holding.name} from {path}")
    return EXIT_OK


def cmd_holdings_update(args: argparse.Namespace) -> int:
    portfolio = _load(args.file)
    holding = portfolio.find(args.name)
    if holding is None:
        print(f"No holding matches {args.name!r}.", file=sys.stderr)
        return EXIT_USAGE

    changes: dict[str, object] = {}
    for field_name in ("sector", "qty", "avg_cost", "realized_pl", "notes", "nse_symbol", "yahoo_ticker"):
        value = getattr(args, field_name, None)
        if value is not None:
            changes[field_name] = value.upper() if field_name == "nse_symbol" else value
    if args.verify_symbol is not None:
        changes["verify_symbol"] = args.verify_symbol
    if args.clear_notes:
        changes["notes"] = None
    if not changes:
        print("Nothing to change. Pass at least one field, e.g. --qty 300.", file=sys.stderr)
        return EXIT_USAGE

    from dataclasses import replace

    try:
        candidate = replace(holding, **changes)  # type: ignore[arg-type]
        updated_rows = [candidate if h is holding else h for h in portfolio.holdings]
        updated = holdings_mod.replace_holdings(portfolio, updated_rows)
        # Round-trip through the validator so a bad edit never lands on disk.
        holdings_mod.parse(updated.to_dict(), path=updated.path)
    except (HoldingsError, TypeError) as exc:
        print(f"Rejected: {exc}", file=sys.stderr)
        return EXIT_BAD_DATA

    path = holdings_mod.save(updated)
    print(f"Updated {holding.name} in {path}:")
    for key, value in changes.items():
        print(f"  {key}: {getattr(holding, key)!r} -> {value!r}")
    return EXIT_OK


# ----------------------------------------------------------- verify-symbols


def _print_report(report: Report, *, portfolio: Portfolio) -> None:
    rows = [
        [
            r.name,
            r.ticker,
            r.status.value.upper(),
            "yes" if r.flagged else "",
            r.checked_with or "—",
            r.detail,
        ]
        for r in report.results
    ]
    print(_table(["Name", "Ticker", "Status", "Guessed", "Source", "Detail"], rows))
    print(
        f"\n{len(report.ok)} ok, {len(report.bad)} bad, {len(report.unknown)} unverified, "
        f"{len(report.skipped)} skipped (unlisted)."
    )

    if report.bad:
        print("\nTickers that do not resolve — correct these in holdings.json:")
        for r in report.bad:
            print(f"  - {r.name}: {r.ticker} — {r.detail}")
            for suggestion in r.suggestions:
                print(f"      maybe: {suggestion}")
            if not r.suggestions:
                print("      no suggestion found; check the broker app or NSE website")

    if report.unverified_flagged:
        print("\nGuessed tickers still unverified (no source answered):")
        for r in report.unverified_flagged:
            print(f"  - {r.name}: {r.ticker} — {r.detail}")

    if report.source_failures:
        print("\nSource failures:")
        for source, failures in report.source_failures.items():
            print(f"  {source}:")
            for failure in failures:
                print(f"    - {failure}")

    summary = holdings_mod.summarize(portfolio)
    for block in (
        _bullets("Cost basis missing (fix in broker app, or leave as is)", summary.missing_cost_basis),
        _bullets("Incomplete row — confirm against the broker app", summary.incomplete),
    ):
        if block:
            print("\n" + block)


def cmd_verify_symbols(args: argparse.Namespace) -> int:
    portfolio = _load(args.file)
    config.ensure_dirs()

    scope = "guessed tickers" if args.only_flagged else "all listed holdings"
    print(f"Verifying {scope} from {portfolio.path.name} (as of {portfolio.as_of})\n")

    report = verify_portfolio(
        portfolio, only_flagged=args.only_flagged, suggest=not args.no_suggest
    )
    _print_report(report, portfolio=portfolio)

    if args.json_out:
        payload = {
            "as_of": portfolio.as_of,
            "results": [
                {
                    "name": r.name,
                    "nse_symbol": r.holding.nse_symbol,
                    "yahoo_ticker": r.holding.yahoo_ticker,
                    "status": r.status.value,
                    "verify_symbol": r.flagged,
                    "checked_with": r.checked_with,
                    "detail": r.detail,
                    "resolved_name": r.resolved_name,
                    "last_price": r.last_price,
                    "suggestions": r.suggestions,
                }
                for r in report.results
            ],
            "source_failures": report.source_failures,
        }
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        args.json_out.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"\nWrote {args.json_out}")

    if report.all_sources_down:
        print(
            "\nNo market data source could be reached, so nothing was verified. "
            "This is a network problem, not a holdings problem.",
            file=sys.stderr,
        )
        return EXIT_SOURCES_DOWN
    if report.blocked:
        print(
            "\nStopping: fix the tickers above (or re-run when the sources are reachable) "
            "before building a brief.",
            file=sys.stderr,
        )
        return EXIT_NEEDS_FIX
    print("\nAll listed tickers resolve. Safe to move on to the price fetch.")
    return EXIT_OK


def cmd_dashboard(args: argparse.Namespace) -> int:
    from . import dashboard, market as market_mod
    from .portfolio import analyse

    portfolio = _load(args.file)
    config.ensure_dirs()

    tickers = {h.nse_symbol: h.yahoo_ticker for h in portfolio.listed if h.nse_symbol and h.yahoo_ticker}
    market = market_mod.collect(tickers, offline=args.offline)
    analytics = analyse(portfolio, market)
    result = dashboard.build(portfolio, market, analytics)

    print(f"Prices: {market.tier} (as of {market.as_of or 'n/a'})")
    for status in market.statuses:
        print(f"  {status.name}: {status.label}" + (f" — {status.detail}" if status.detail else ""))
    print(
        f"\n{analytics.priced_count} of {len(analytics.positions)} rows priced · "
        f"value {compact(analytics.total_value)} · "
        f"unrealised {compact(analytics.unrealised)} on {analytics.measurable} rows with a cost basis"
    )
    if analytics.concentration:
        conc = analytics.concentration
        print(
            f"Top 3 = {conc.top3_pct:.0f}% ({compact(conc.top3_value)}); "
            f"a 10% fall across them = {compact(conc.top3_drawdown_10pct)}"
        )
    print(f"\nWrote {result.index_path}\n      {result.archive_path}")
    if market.tier != "live":
        print(
            "\nPrices are not live — the dashboard says so at the top of the page.",
            file=sys.stderr,
        )
    return EXIT_OK


def cmd_run(args: argparse.Namespace) -> int:
    from . import run as run_mod
    from .telegram import Telegram

    result = run_mod.morning(
        offline=args.offline,
        skip_brief=args.no_brief,
        force=args.force,
        holdings_path=args.file,
    )

    if not result.traded:
        print(f"{result.day}: market closed ({result.reason}). Nothing to do.")
        return EXIT_OK

    analytics = result.analytics
    assert analytics is not None
    print(f"{result.day} — {result.reason}\n")
    for status in result.statuses:
        print(f"  {status.name}: {status.label}" + (f" — {status.detail}" if status.detail else ""))

    print(
        f"\nValue {compact(analytics.total_value)} · "
        f"unrealised {compact(analytics.unrealised)} on {analytics.measurable} measurable rows"
    )
    if result.watchlist:
        print(f"\nWatchlist ({len(result.watchlist)}):")
        for item in result.watchlist:
            print(f"  {item.score:5.1f}  {item.name}")
            for reason in item.reasons:
                print(f"         · {reason}")
    else:
        print("\nNothing on the watchlist.")

    brief_result = result.brief
    if brief_result and brief_result.ok and brief_result.text:
        print("\n" + "-" * 60)
        print(brief_result.text)
        print("-" * 60)
    elif brief_result:
        print(f"\nBrief unavailable: {brief_result.failure}")
        if brief_result.rejected_numbers:
            print(f"  numbers it could not support: {', '.join(brief_result.rejected_numbers)}")

    print(f"\nDashboard: {result.dashboard_path}")

    if args.dry_run:
        print("\nDry run — nothing sent.")
        return EXIT_OK

    telegram = Telegram()
    if not telegram.configured:
        print("\nTelegram is not configured; set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.",
              file=sys.stderr)
        return EXIT_OK

    if brief_result and brief_result.ok and brief_result.text:
        sent = telegram.send_text(brief_result.text)
        print(f"\nTelegram: {sent.sent} message(s) sent" + (f", {sent.failures}" if sent.failures else ""))
    if args.send_dashboard and result.dashboard_path:
        doc = telegram.send_document(
            result.dashboard_path, caption=f"Portfolio desk — {result.day}"
        )
        print(f"Dashboard sent: {doc.ok}")
    return EXIT_OK


def cmd_holidays(args: argparse.Namespace) -> int:
    from . import trading_days

    year = args.year or date.today().year
    calendar = trading_days.refresh(year) if args.refresh else trading_days.load(year)
    status = trading_days.status(calendar=calendar)
    print(f"{year}: {len(calendar.dates)} holidays, source: {calendar.source}")
    print(f"verified: {calendar.verified}")
    for day in sorted(calendar.dates):
        print(f"  {day}")
    print(f"\nToday ({status.day}): {'open' if status.is_open else 'closed'} — {status.reason}")
    if not calendar.verified:
        print(
            "\nThe full list could not be fetched from NSE, so only fixed-date holidays are "
            "known. Re-run with --refresh when NSE is reachable.",
            file=sys.stderr,
        )
        return EXIT_SOURCES_DOWN
    return EXIT_OK


# -------------------------------------------------------------------- parser


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m desk",
        description="Portfolio Morning Desk — read-only daily brief for an Indian equity portfolio.",
    )
    parser.add_argument(
        "--file",
        type=Path,
        default=None,
        metavar="PATH",
        help=f"holdings file (default: {config.HOLDINGS_FILE.name})",
    )
    parser.add_argument("-v", "--verbose", action="store_true", help="log source activity")
    sub = parser.add_subparsers(dest="command", required=True)

    holdings_parser = sub.add_parser("holdings", help="inspect or edit holdings.json")
    holdings_sub = holdings_parser.add_subparsers(dest="holdings_command", required=False)

    list_parser = holdings_sub.add_parser("list", help="show holdings and what needs attention")
    list_parser.add_argument("--json", action="store_true", help="print the validated JSON instead")
    list_parser.set_defaults(func=cmd_holdings_list)
    holdings_parser.set_defaults(func=cmd_holdings_list, json=False)

    add_parser = holdings_sub.add_parser("add", help="add a holding")
    add_parser.add_argument("name", help="company name as it should appear in the brief")
    add_parser.add_argument("--nse-symbol", help="NSE symbol; omit for an unlisted holding")
    add_parser.add_argument("--yahoo-ticker", help="Yahoo ticker (default: <NSE symbol>.NS)")
    add_parser.add_argument("--sector", default="Unknown")
    add_parser.add_argument("--qty", type=float, required=True)
    add_parser.add_argument("--avg-cost", type=float, default=None, help="omit if unknown")
    add_parser.add_argument("--realized-pl", type=float, default=0.0)
    add_parser.add_argument("--notes", default=None)
    add_parser.add_argument(
        "--verify-symbol", action="store_true", help="flag the ticker as a guess"
    )
    add_parser.set_defaults(func=cmd_holdings_add)

    remove_parser = holdings_sub.add_parser("remove", help="remove a holding by name or symbol")
    remove_parser.add_argument("name")
    remove_parser.set_defaults(func=cmd_holdings_remove)

    update_parser = holdings_sub.add_parser("update", help="change fields on one holding")
    update_parser.add_argument("name", help="name or NSE symbol")
    update_parser.add_argument("--qty", type=float)
    update_parser.add_argument("--avg-cost", type=float, dest="avg_cost")
    update_parser.add_argument("--realized-pl", type=float, dest="realized_pl")
    update_parser.add_argument("--sector")
    update_parser.add_argument("--nse-symbol", dest="nse_symbol")
    update_parser.add_argument("--yahoo-ticker", dest="yahoo_ticker")
    update_parser.add_argument("--notes")
    update_parser.add_argument("--clear-notes", action="store_true")
    group = update_parser.add_mutually_exclusive_group()
    group.add_argument(
        "--verify-symbol", dest="verify_symbol", action="store_const", const=True, default=None
    )
    group.add_argument(
        "--verified", dest="verify_symbol", action="store_const", const=False,
        help="clear the guessed-ticker flag",
    )
    update_parser.set_defaults(func=cmd_holdings_update)

    verify_parser = sub.add_parser(
        "verify-symbols", help="check every ticker resolves on Yahoo/NSE"
    )
    verify_parser.add_argument(
        "--only-flagged", action="store_true", help="check only verify_symbol: true rows"
    )
    verify_parser.add_argument(
        "--no-suggest", action="store_true", help="skip the name search for suggestions"
    )
    verify_parser.add_argument(
        "--json-out", type=Path, default=None, metavar="PATH", help="also write the report as JSON"
    )
    verify_parser.set_defaults(func=cmd_verify_symbols)

    dash_parser = sub.add_parser("dashboard", help="rebuild site/index.html")
    dash_parser.add_argument(
        "--offline",
        action="store_true",
        help="skip the live fetch and use the price snapshot only",
    )
    dash_parser.set_defaults(func=cmd_dashboard)

    run_parser = sub.add_parser("run", help="the full morning run")
    run_parser.add_argument("--dry-run", action="store_true", help="print it, send nothing")
    run_parser.add_argument("--offline", action="store_true", help="no network; snapshot prices only")
    run_parser.add_argument("--no-brief", action="store_true", help="skip the Claude call")
    run_parser.add_argument("--force", action="store_true", help="run even on a holiday or weekend")
    run_parser.add_argument(
        "--send-dashboard", action="store_true", help="also send the HTML file to Telegram"
    )
    run_parser.set_defaults(func=cmd_run)

    holidays_parser = sub.add_parser("holidays", help="show or refresh the NSE holiday list")
    holidays_parser.add_argument("--refresh", action="store_true", help="fetch from NSE and cache")
    holidays_parser.add_argument("--year", type=int, default=None)
    holidays_parser.set_defaults(func=cmd_holidays)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.WARNING,
        format="%(levelname)s %(name)s: %(message)s",
    )
    try:
        return int(args.func(args))
    except BrokenPipeError:  # `... | head` closed the pipe
        return EXIT_OK
