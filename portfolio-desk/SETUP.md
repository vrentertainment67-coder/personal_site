# Making it live

Four things, in this order. The first is the only one that cannot be done from
here, and nothing works until it is done.

---

## 1. Run it on GitHub, not in a Claude session

The desk needs to reach Yahoo, NSE and Google News. A Claude cloud session may
have those hosts blocked by its environment's egress policy — that is why every
run in chat has fallen back to the price snapshot. **GitHub Actions runners have
open network access**, so that restriction does not apply where the desk actually
runs. There is nothing to configure.

First, get this branch onto `master`. Scheduled workflows only ever run from the
default branch, so until it is merged nothing fires at 08:30 regardless of the
rest of this file.

Then: **Actions → Portfolio desk — check → Run workflow**, and pick a task:

| Task | What it does | Secrets needed |
|---|---|---|
| `verify-symbols` | resolves all 40 tickers against Yahoo, then NSE | none |
| `holidays` | fetches NSE's trading-holiday list and caches it | none |
| `dry-run-no-brief` | the full pipeline minus the Claude call | none |
| `dry-run` | everything, prints the brief, sends nothing | `ANTHROPIC_API_KEY` |

Start with `verify-symbols`. It needs no secrets, takes about a minute, and the
result — the real answer on LTM, NSE, Manipal Health, LML and the rest — lands in
the job summary and as a downloadable `verify.json`. Until those tickers resolve,
a wrong ticker means a wrong price and every number downstream inherits it.

If you do want it working inside a Claude session too, the setting is the cloud
environment menu in the session title bar → **Edit** → **Network access** → Custom,
adding `query1.finance.yahoo.com`, `www.nseindia.com` and `news.google.com` while
keeping the default package-manager domains. It is optional, and if that menu is
not there (an environment someone else owns, or a session started outside the
desktop app), skip it — GitHub is the path that matters.

---

## 2. Secrets (you, 5 minutes)

In the GitHub repo: **Settings → Secrets and variables → Actions**.

| Secret | Where it comes from |
|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com → API keys |
| `TELEGRAM_BOT_TOKEN` | message [@BotFather](https://t.me/botfather), `/newbot` |
| `TELEGRAM_CHAT_ID` | message your new bot once, then open `https://api.telegram.org/bot<TOKEN>/getUpdates` and read `message.chat.id` |
| `CLOUDFLARE_API_TOKEN` | step 3 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard, right-hand sidebar |

Optional repo **variable** `ANTHROPIC_MODEL` (default `claude-opus-5-5`).

A daily brief costs a fraction of a cent: the payload is a few thousand tokens
and the output is under 350 words, run at low effort.

---

## 3. Cloudflare Pages + Access (you, ~15 minutes)

This puts the dashboard on a real URL that only you can open.

1. **Create the project.** Cloudflare dashboard → Workers & Pages → Create →
   Pages → **Upload assets** (direct upload, *not* Connect to Git — the workflow
   pushes the built page itself with wrangler, and a Git-connected project would
   fight it). Name it `portfolio-desk`; the workflow uses that name. Drag any
   placeholder file in to finish creating it.
2. **Create the API token.** My Profile → API Tokens → Create Token → template
   *Edit Cloudflare Workers*, or a custom token with **Account → Cloudflare Pages
   → Edit**. Paste it into GitHub as `CLOUDFLARE_API_TOKEN`.
3. **Lock it down — do this before the first deploy.** Zero Trust → Access →
   Applications → Add an application → Self-hosted. Domain: your
   `portfolio-desk.pages.dev` (and the preview subdomain). Add one policy:
   *Allow*, include **Emails** → your email address. Pick the one-time-PIN login
   method so there is nothing else to set up.

Until step 3 is done the page is public to anyone who guesses the URL, and it
lists every holding and position size. The workflow deploys only if
`CLOUDFLARE_API_TOKEN` is present, so leaving the secret unset keeps it offline.

---

## 4. Turn on the schedule

The workflow at `.github/workflows/portfolio-desk.yml` runs `0 3 * * 1-5` —
03:00 UTC, which is 08:30 IST — and starts by checking the NSE holiday list,
exiting early when the market is shut.

Try it by hand first: **Actions → Portfolio morning desk → Run workflow**, with
*dry run* ticked. That builds everything and sends nothing. When the output
looks right, run it again without dry run, then leave the schedule alone.

GitHub throttles scheduled workflows on busy repos and can fire a few minutes
late; that is normal and the brief says the time its data belongs to.

---

## What arrives each morning

- A Telegram message with the brief: mood, Nifty and Bank Nifty levels, your
  watchlist, news, sectors.
- The dashboard at your Cloudflare URL, rebuilt, with a dated copy kept in
  `site/archive/`.
- A commit with that day's `site/` and `data/levels/` so you can look back.

If a source is down, the section says so and the rest still goes out. If Claude
writes a number that is not in the payload, the brief is regenerated once and
then dropped rather than sent. Nothing in it is a recommendation.
