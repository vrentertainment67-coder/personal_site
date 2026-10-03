# Portfolio Morning Desk — Build Brief

You are building a standalone, read-only daily market brief and dashboard for Vic's
Indian equity portfolio. There is **no broker integration**. Holdings come from
`holdings.json` (maintained by hand). Market data comes from free public sources.

## Goal

Every trading weekday at 08:30 IST:

1. Refresh prices, levels, and news for every holding plus the main indices.
2. Generate a written pre-market brief with Claude.
3. Rebuild a static HTML dashboard.
4. Send the brief (and dashboard link) to Telegram.

Optional phase 2: an intraday monitor that alerts when a stock or index nears a level.

## Hard rules

- **Read-only.** No broker APIs, no order placement, no credentials beyond the ones listed below.
- **Numbers come from code, never from the LLM.** Python computes every price, level,
  percentage, and P/L figure. Claude only interprets a JSON payload of precomputed values
  and must not invent or adjust numbers. Validate the brief: any number in Claude's output
  that isn't in the payload should fail a check and trigger a regeneration.
- **Fail soft.** If a source is down, the brief still goes out with that section marked
  unavailable. Never send a brief silently built on stale data; show the data timestamp.
- **Not advice.** The brief describes levels and context. No buy/sell/hold calls.
  Footer: "Reference only, not investment advice."
- Skip NSE holidays (fetch the NSE holiday list; keep a local fallback for the current year).

## Inputs

### holdings.json
Schema per holding: `name, nse_symbol, yahoo_ticker, sector, qty, avg_cost, realized_pl,
verify_symbol, notes`.

- `avg_cost: null` means cost basis is missing in the broker app (bonus/demerger/transfer).
  Show value and price moves, but no return %. Surface these in a "fix cost basis" list.
- `verify_symbol: true` means the ticker was guessed from the company name. On first run,
  check each one resolves on Yahoo/NSE and print a table of failures for Vic to correct.
  Known doubts: LTM, NSE, Manipal Health, Tata Capital, JSW Cement, LML, Hyundai, Bajaj Housing.
- `nse_symbol: null` (Bgse Properties) is unlisted: include in counts, exclude from fetches.
- State Bank of India's row was cut off in the screenshots: avg cost known, confirm qty.

Provide a tiny CLI to edit holdings: `python -m desk holdings add|remove|update`.

## Data sources (free, standalone)

| Need | Primary | Fallback |
|---|---|---|
| Daily OHLC, prev close, DMAs | `yfinance` (`.NS` tickers, `^NSEI`, `^NSEBANK`, `^BSESN`) | `nsepython` / NSE bhavcopy CSV |
| Index option chain (OI, PCR, max pain) | NSE option-chain JSON endpoint (needs session cookie from nseindia.com first; set a browser User-Agent) | `nsepython`; if both fail, skip OI levels |
| Stock option chain | Same, only for F&O stocks | Skip |
| India VIX | NSE `allIndices` endpoint | yfinance `^INDIAVIX` |
| FII/DII provisional | NSE `fiidiiTradeReact` endpoint | Skip with note |
| Global cues | yfinance: `^GSPC ^IXIC ^DJI ^N225 ^HSI CL=F BZ=F GC=F INR=X ^TNX` | — |
| GIFT Nifty | Best effort scrape; if unavailable, omit and say so | — |
| News per stock | Google News RSS (`q="<company name>" when:1d`, `hl=en-IN&gl=IN`) | ET Markets / Moneycontrol RSS |
| Results & corporate actions | NSE corporate announcements / event calendar endpoints | Skip |

NSE endpoints are rate-limited and change without notice. Wrap them in one `nse_client.py`
with session reuse, retries with backoff, a 1-request-per-second limit, and response caching
in `data/cache/` for the day. Log every source failure.

## Levels (computed in Python)

For each index and each listed holding:

- Classic pivots from previous day H/L/C: P, R1–R3, S1–S3
- CPR (TC, P, BC) and CPR width as % (narrow = trending day likely, wide = range likely)
- Previous day high/low, previous week high/low
- 20 / 50 / 200 DMA and position of price vs each
- 52-week high/low and distance from each
- Recent swing highs/lows (fractal method on daily bars, last 60 sessions)
- F&O instruments only: highest call OI strike (resistance), highest put OI strike (support),
  PCR, max pain

Then cluster nearby levels (within 0.3% for indices, 0.75% for stocks) into **zones**, rank
by how many methods agree, and output the 2–3 nearest support and resistance zones with
the contributing methods listed. Store everything in `data/levels/YYYY-MM-DD.json`.

Indices to cover: NIFTY 50, BANKNIFTY, FINNIFTY, MIDCPNIFTY, SENSEX, plus a sector
snapshot of the Nifty sectoral indices (IT, Bank, Auto, Pharma, Metal, Energy, FMCG, PSU Bank, Realty).

## Portfolio analytics

- Value, weight, unrealised P/L, return % (when cost basis exists), day change
- Sector allocation using the `sector` field
- Concentration: top-3 and top-5 weight; scenario line "a 10% fall in the top 3 = ₹X"
- Movers since last brief: biggest gainers/losers by % and by ₹
- Proximity alerts: holdings within 2% of a support/resistance zone, a 52-week high/low,
  or crossing a key DMA
- Events today: results, ex-dates, AGMs for any holding

## The brief (Claude API)

Use the Anthropic Python SDK, model from env `ANTHROPIC_MODEL`. Send one JSON payload with
everything precomputed. Prompt Claude to produce, in under ~350 words:

1. Market mood in 2–3 sentences (global cues, VIX, FII/DII, GIFT Nifty if available)
2. Nifty and Bank Nifty: support and resistance zones with one line on why each matters
3. My portfolio: today's watchlist (holdings near levels, with news, or with events)
4. News that touches my holdings, one line each, with source names
5. Sectors leading/lagging

Tone: plain, direct, no hype, no recommendations. Indian number formatting (lakh/crore).
Save the prompt in `prompts/brief.md` so Vic can edit it without touching code.

## Dashboard

Static single-file HTML in `site/index.html`, rebuilt each run, plus dated archives in
`site/archive/`. Use `reference/dashboard-v0.html` as the visual starting point (palette,
type, concentration strip, sector bars, "worth a look" flags, sortable table). Add:

- Index level cards with zones drawn on a small horizontal price ruler
- Per-holding columns: day change, nearest support, nearest resistance, distance to each
- A "today" panel with the Claude brief
- Data timestamp and per-source status (ok / stale / failed)

Host on GitHub Pages (private repo + Pages, or a separate public Pages repo containing
only the HTML if the main repo stays private). Note that a public page exposes holdings;
default to password-protecting via Cloudflare Pages Access or keep it local and send the
HTML file to Telegram instead. Ask Vic which he prefers before publishing anything.

## Delivery

Telegram bot: send the brief as formatted text (MarkdownV2, escaped properly) plus the
dashboard link or HTML file. Split messages over 4,096 characters.

## Scheduling

GitHub Actions, cron `0 3 * * 1-5` (08:30 IST). First step checks the NSE holiday list and
exits early on holidays. Commit `data/levels` and `site/` back to the repo. Also provide
`python -m desk run --dry-run` for local testing (prints the brief, sends nothing).

Phase 2 intraday monitor: separate workflow or local process, every 5 min from 09:15 to
15:30 IST, alerting once per level per day when price comes within 0.2% (indices) or
0.5% (stocks) of a zone or breaks it.

## Environment variables

```
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
TZ=Asia/Kolkata
```

Store as GitHub Actions secrets. Never commit `.env`.

## Suggested structure

```
desk/
  __main__.py        # CLI: run, holdings, verify-symbols
  config.py
  holdings.py        # load/validate holdings.json
  sources/
    nse_client.py
    yahoo.py
    news.py
    global_cues.py
  levels.py          # pivots, CPR, swings, OI, zone clustering
  portfolio.py       # analytics, flags
  brief.py           # Claude call + number validation
  dashboard.py       # Jinja2 -> site/index.html
  telegram.py
prompts/brief.md
templates/dashboard.html.j2
holdings.json
reference/dashboard-v0.html
tests/
.github/workflows/morning.yml
```

## Build order

1. Holdings loader + `verify-symbols`; report bad tickers to Vic and stop for corrections.
2. Price fetch + portfolio analytics; regenerate the v0 dashboard from live prices.
3. Levels engine with unit tests (known OHLC in, known pivots out).
4. NSE client: option chain, VIX, FII/DII, holidays, with fallbacks.
5. News + events.
6. Claude brief with number validation.
7. Telegram delivery, then GitHub Actions schedule.
8. Phase 2 intraday alerts.

Show Vic a dry-run brief and dashboard after step 7 before enabling the schedule.

## Open items for Vic

- Correct any tickers flagged by `verify-symbols`
- Confirm SBI quantity, and whether a holding between SBI and Sun Pharma was missed
- Fill in cost basis for holdings with `avg_cost: null`, if available
- Choose dashboard hosting: private link, password-protected page, or Telegram file only
