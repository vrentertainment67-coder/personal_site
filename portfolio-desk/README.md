# Portfolio Morning Desk

A read-only daily market brief and dashboard for Vic's Indian equity portfolio.
No broker integration: holdings are maintained by hand in `holdings.json`, market
data comes from free public sources. The full brief is in [CLAUDE.md](CLAUDE.md).

**Status: steps 1–2 plus the dashboard.** Holdings loader, `verify-symbols`,
portfolio analytics and `site/index.html`. The levels engine, NSE option chain,
news, the written brief, Telegram and the schedule are still to come, and the
dashboard names them as missing rather than hiding the gaps.

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
python -m desk dashboard                  # rebuild site/index.html + a dated archive
python -m desk dashboard --offline        # skip the live fetch, use the price snapshot
```

Open `site/index.html` in a browser; it is a single self-contained file.

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

## Where prices come from

Three tiers, and the tier travels with every figure to the page:

1. **live** — Yahoo quotes fetched this run.
2. **snapshot** — `data/prices-snapshot.json`, the last close captured alongside the
   broker-app screenshots. Used only for rows the live fetch could not supply.
3. **none** — the row shows no price, is excluded from the total value, and takes no
   weight.

Anything short of a full live fetch puts a banner at the top of the dashboard naming
the date the prices actually belong to. A missing cost basis suppresses P/L and return
for that row rather than counting the position as pure profit.

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
  market.py        price tiers (live / snapshot / none) and per-source health
  portfolio.py     value, weights, P/L, sectors, concentration, flags
  dashboard.py     context for the template, writes site/ and site/archive/
  format.py        lakh/crore and Indian digit grouping
  sources/
    http.py        session reuse, rate limit, retries, day cache, failure classes
    yahoo.py       chart + search
    nse_client.py  quote-equity (option chain, VIX, FII/DII, holidays come later)
templates/dashboard.html.j2
holdings.json
data/prices-snapshot.json
site/index.html            (generated)
reference/dashboard-v0.html
tests/
```
