# Portfolio Morning Desk

A read-only daily market brief and dashboard for Vic's Indian equity portfolio.
No broker integration: holdings are maintained by hand in `holdings.json`, market
data comes from free public sources. The full brief is in [CLAUDE.md](CLAUDE.md).

**Status: complete.** Holdings, symbol verification, prices, levels, the signal
engine, news, the Claude brief, the dashboard, Telegram and the 08:30 IST
schedule are all built and tested. It runs on GitHub Actions, where the network
is open; a Claude cloud session may have market-data hosts blocked, which only
affects runs started from chat. See [SETUP.md](SETUP.md).

## Setup

```sh
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
```

## The morning run

```sh
python -m desk run --dry-run     # everything, prints the brief, sends nothing
python -m desk run               # and delivers it to Telegram
python -m desk run --offline     # snapshot prices, no network at all
python -m desk run --no-brief    # skip the Claude call
python -m desk run --force       # ignore the holiday/weekend check
```

The order is fixed: prices and daily history, then levels, then the signals that
read those levels, then news for the names the signals surfaced, then Claude,
then the page. Each stage fails soft — a dead source removes a section and turns
a chip red; it never aborts the run and never swaps stale data in silently.

## What is "smart" here

`desk/signals.py` scores each holding from rules, never from a model:

| Signal | Fires when |
|---|---|
| near support / resistance | price is within 2% (0.2% for an index) of a zone |
| inside a zone | price is between the zone's edges |
| 52-week extreme | within 2% of the high or low, **and** the year's range is at least 15% wide |
| DMA cross | price closed through a 20/50/200 DMA by at least 0.25% |
| big move | the session moved 3% or more |
| volume spike | 2x the 20-day average |
| event / news | a result date, or headlines today |
| deep drawdown | down more than 20% on cost |
| data problems | missing cost basis, unverified ticker |

Scores are the sum of signal weights, tilted (never created) by position size, so
a 24% holding outranks a 0.2% one on the same news. Zones count agreement by
*family* — the pivot ladder, CPR and S/R are one calculation, so a zone holding
"pivot, CPR top, S1" counts as one method agreeing with itself, not three. Only
the nearest zone each side is reported. Every line carries its reason.

## Buy / keep / sell

`python -m desk ratings` scores every holding and `--explain SYMBOL` shows the
arithmetic. Six factors, fixed weights, stated thresholds:

| Factor | Weight | What it reads |
|---|---|---|
| trend | 0.30 | price against the 20, 50 and 200 DMA |
| momentum | 0.20 | position inside the 52-week range |
| levels | 0.15 | distance to the nearest support vs resistance |
| size | 0.15 | position weight; bites above 10% of the book |
| volatility | 0.10 | annualised, last 60 sessions |
| your cost | 0.10 | return against average cost |

Score above +0.30 is Buy, below -0.25 is Sell, between is Keep. A position at
20% or more of the book is never a Buy however good the chart looks. Missing
data narrows the scorecard (`confidence: full / partial / thin`) rather than
being guessed, and no history at all means **No rating**, not a default Keep.

`flip_levels` is the forward-looking part: the price at which this same
scorecard would read Buy or Sell, found by re-scoring at candidate prices. It is
solved for, not predicted.

**This is not advice and not a forecast.** There is no price target, no earnings
estimate and no view on any company's business, because the desk holds no data
that would support one. It is a mechanical read of price history and position
size, and it says so wherever it appears.

Claude then reads that JSON and writes the brief. It gets no price feed, does no
arithmetic, and every number it writes is checked back against the payload at the
precision it was written to; a draft citing a figure that isn't there is
regenerated once and then dropped rather than sent. `prompts/brief.md` is the
prompt — edit it without touching code.

## Holdings and tickers



```sh
python -m desk holdings list              # every row, plus what needs attention
python -m desk holidays --refresh         # fetch and cache the NSE holiday list
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
  run.py           the morning pipeline, and data/levels/<date>.json
  levels.py        pivots, CPR, DMAs, swings, 52w, zone clustering
  signals.py       the scored attention list
  oi.py            PCR, OI walls, max pain
  brief.py         the Claude call and its retry loop
  numbers.py       the "every figure came from the payload" check
  telegram.py      MarkdownV2 delivery, 4,096-char splitting
  trading_days.py  NSE holidays, with a fixed-date fallback
  market.py        price tiers (live / snapshot / none) and per-source health
  portfolio.py     value, weights, P/L, sectors, concentration, flags
  dashboard.py     context for the template, writes site/ and site/archive/
  format.py        lakh/crore and Indian digit grouping
  sources/
    http.py        session reuse, rate limit, retries, day cache, failure classes
    yahoo.py       chart + search
    nse_client.py  quote-equity, option chain, VIX, FII/DII, holidays
    news.py        Google News RSS per holding
templates/dashboard.html.j2
holdings.json
data/prices-snapshot.json
site/index.html            (generated)
reference/dashboard-v0.html
tests/
```
