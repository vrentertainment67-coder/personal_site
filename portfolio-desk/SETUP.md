# Making it live

Four things, in this order. The first is the only one that cannot be done from
here, and nothing works until it is done.

---

## 1. Open the network (you, 2 minutes)

The desk needs to reach three hosts. In this cloud session they are currently
blocked by the environment's egress policy, which is why every run so far has
fallen back to the price snapshot.

In the Claude app: the cloud environment menu in the session title bar → **Edit**
→ **Network access**. Either pick a broader level, or choose **Custom** and add:

```
query1.finance.yahoo.com      prices, daily history, global cues
www.nseindia.com              option chain, India VIX, FII/DII, holiday list
news.google.com               headlines per holding
```

Keep the default package-manager domains that are already listed.
Reference: https://code.claude.com/docs/en/cloud-environments#network-access

Then check it worked:

```sh
python -m desk verify-symbols        # the 8 guessed tickers, resolved for real
python -m desk run --dry-run         # full run, prints the brief, sends nothing
```

`verify-symbols` is the one to run first. Until it passes, a wrong ticker means
a wrong price, and every number downstream inherits it.

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
