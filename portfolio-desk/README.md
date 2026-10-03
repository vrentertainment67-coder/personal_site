# Portfolio Morning Desk

A read-only daily market brief and dashboard for Vic's Indian equity portfolio.
No broker integration: holdings are maintained by hand in `holdings.json`, market
data comes from free public sources. The full brief is in [CLAUDE.md](CLAUDE.md).

**Status: step 1 of 8 complete** — holdings loader and `verify-symbols`.
Price fetch, levels, news, the Claude brief, the dashboard, Telegram and the
schedule are still to come.

## Setup

```sh
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
```

## What works today

```sh
python -m desk holdings list              # every row, plus what needs attention
python -m desk holdings list --json       # the validated document
python -m desk verify-symbols             # check every ticker against Yahoo, then NSE
python -m desk verify-symbols --only-flagged
python -m desk verify-symbols --json-out data/verify.json
```

Editing holdings (validated before anything is written):

```sh
python -m desk holdings add "Bharat Electronics" --nse-symbol BEL --sector Defence \
    --qty 100 --avg-cost 120.5
python -m desk holdings update SBIN --qty 300 --notes "confirmed 2026-10-03"
python -m desk holdings update "Tata Capital" --verified   # clear the guessed-ticker flag
python -m desk holdings remove BEL
```

Any command takes `--file PATH` to work on a copy instead of `holdings.json`.

## holdings.json rules the loader enforces

- `avg_cost: null` means the cost basis is missing in the broker app. The row keeps
  its value and price moves; return % is suppressed and the name goes on the
  "fix cost basis" list. `avg_cost: 0` is rejected — write `null` instead.
- `nse_symbol: null` means unlisted (Bgse Properties). Counted in the portfolio,
  never fetched. `nse_symbol` and `yahoo_ticker` must both be set or both be null.
- `verify_symbol: true` means the ticker was guessed from the company name.
- `realized_pl: null` marks a row that was never fully captured from the broker app
  (State Bank of India) and shows up on the "confirm against the broker app" list.
- Duplicate names or symbols, unknown fields and non-positive quantities are errors.

## verify-symbols

Each listed holding is checked against Yahoo's chart endpoint; if Yahoo has no such
ticker, or cannot be reached, NSE's quote endpoint gets a turn. The distinction the
command exists to protect:

| Status | Meaning |
|---|---|
| `OK` | a source returned a quote for the ticker in `holdings.json` |
| `BAD` | a source answered and the ticker does not exist — suggestions are printed |
| `UNKNOWN` | no source could be reached; **nothing is claimed about the ticker** |
| `SKIPPED` | unlisted row, excluded from fetches by design |

Exit codes: `0` all good · `3` holdings.json is malformed · `4` tickers need
correcting (or a guessed one could not be checked) · `5` no source reachable at all.
The pipeline stops on 3, 4 and 5 rather than build a brief around a missing stock.

## Tests

```sh
python -m pytest tests -q
```

The suite runs offline: sources are faked, including the case where the network is
down (which must read `UNKNOWN`, never `BAD`).

## Layout

```
desk/
  __main__.py      python -m desk
  cli.py           commands: holdings, verify-symbols, run (stub)
  config.py        paths, env, request etiquette
  holdings.py      load / validate / edit holdings.json
  verify.py        ticker verification and the report
  sources/
    http.py        session reuse, rate limit, retries, day cache, failure classes
    yahoo.py       chart + search
    nse_client.py  quote-equity (option chain, VIX, FII/DII, holidays come later)
holdings.json
reference/dashboard-v0.html
tests/
```
