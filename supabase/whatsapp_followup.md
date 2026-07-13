# Chamatkar follow-up — WhatsApp Business (Cloud API) automation

This turns the manual, tap-to-send follow-up into an automated one: reminders
the day before, the experience check the morning after, and — only for guests
who reply positively — a Google review ask, with gentle recovery for
no-shows/negatives. Everything is idempotent and keyed by event, so it re-runs
cleanly per edition.

## Pieces in this repo

| File | What it does |
|---|---|
| `supabase/whatsapp_followup.sql` | Adds `reply_text` / `experience_source` / `wa_opt_in_at` to `event_rsvps` + the `wa_messages` send/inbound log. Run after `event_followup.sql`. |
| `supabase/functions/whatsapp-send/` | Sends the templates via Meta, stamps the lifecycle, idempotent. Has a daily `cron` sweep. |
| `supabase/functions/whatsapp-webhook/` | Receives replies → classifies sentiment → sets `experience` (routes review vs. recovery) → honours STOP. |
| `.github/workflows/whatsapp-followup.yml` | Pings the `cron` sweep once a day. |
| RSVP forms | Now capture a WhatsApp consent checkbox (`consent_followup` + `wa_opt_in_at`). |

Nothing sends until the Meta credentials below are set — the functions return
a config error and the manual tab keeps working in the meantime.

---

## 0. Decide the sender number (do this first)
A number can be on the WhatsApp Business **App** *or* the **Cloud API**, not
both. Either migrate your current number to the API (you lose the app on it) or
**dedicate a second number** to the API and keep the app for manual chats.
Recommended: a dedicated number.

## 1. Get Cloud API access (Meta)
Business verification is already done ✅. Then in [developers.facebook.com](https://developers.facebook.com):
1. Create an app → add the **WhatsApp** product.
2. Note the **Phone Number ID** and **WhatsApp Business Account (WABA) ID**.
3. Add + verify your sender number.
4. Create a **System User** (Business Settings) with a **permanent token** scoped
   `whatsapp_business_messaging` + `whatsapp_business_management`. This is your
   `WHATSAPP_TOKEN` (the temporary token expires in 24h — don't use it in prod).

## 2. Create the 5 message templates
Business Manager → WhatsApp Manager → **Message templates** → Create. Category
**Marketing**, language **English**. Names must match exactly:

**`chamatkar_reminder`** — vars: `{{1}}`=first name, `{{2}}`=event, `{{3}}`=date, `{{4}}`=venue
```
Hey {{1}}! {{2}} is TOMORROW — {{3}} @ {{4}}, 9 PM onwards. 🔥
You're on the guest list ✅ Get there early, it fills up fast. See you on the floor! 🎧
```

**`chamatkar_experience_check`** — vars: `{{1}}`=first name, `{{2}}`=event
```
Hey {{1}}! 🎶 Hope you had a blast at {{2}} last night 🔥

Quick one — did you make it to the floor? And how was your night?

We'd love to know what you loved (and anything we can make even better next time). Just hit reply — reading every single one. ❤️

— Team {{2}} / DJ VIC
```

**`chamatkar_review_ask`** — vars: `{{1}}`=event, `{{2}}`=review link
```
So glad you had a good time! 🙌 That means a lot.

If you've got 30 seconds, would you drop us a quick review? It genuinely helps us grow and throw bigger, better nights 👇
{{2}}

See you at the next {{1}} — it's going to be even bigger. ✨
```

**`chamatkar_recovery_noshow`** — vars: `{{1}}`=event
```
Ah, sorry we missed you this time! 🙏 We'd love to have you at the next {{1}} — I'll make sure you're first to know when the date drops. Anything you'd want to see more of? All ears. 🎧
```

**`chamatkar_recovery_negative`** — no variables
```
Really appreciate you telling us — sorry it wasn't a 10/10. 🙏 Genuinely want to make the next one better: anything specific you'd change? And the next round's on us to win you back — I'll keep you posted on the date. ❤️
```

Approval is usually minutes–hours. If one is rejected, tweak wording and
resubmit — the code only needs the **names** to stay the same.

## 3. Set secrets + deploy the functions
```bash
supabase secrets set \
  WHATSAPP_TOKEN="EAAG...permanent" \
  WHATSAPP_PHONE_NUMBER_ID="1234567890" \
  WHATSAPP_VERIFY_TOKEN="pick-any-long-random-string" \
  CRON_SECRET="another-long-random-string"

supabase functions deploy whatsapp-send    --no-verify-jwt
supabase functions deploy whatsapp-webhook --no-verify-jwt
```
(`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY` are injected
automatically.)

## 4. Point Meta's webhook at us
WhatsApp Manager → Configuration → **Webhook**:
- Callback URL: `https://jftnhuutttmccmqnnybf.functions.supabase.co/whatsapp-webhook`
- Verify token: the `WHATSAPP_VERIFY_TOKEN` you set above.
- Subscribe to the **messages** field.

Meta calls the URL with a `hub.challenge`; the function echoes it back to verify.

## 5. Wire up the daily cron
Add a GitHub **repo secret** `WHATSAPP_CRON_SECRET` equal to the `CRON_SECRET`
you set in Supabase. The workflow (`.github/workflows/whatsapp-followup.yml`)
then pings the sweep daily at 10:00 IST. Run it once manually from the Actions
tab (**workflow_dispatch**) to smoke-test.

## How the timing works
- **Reminder** → events whose date is *tomorrow*.
- **Experience check** → events whose date was *yesterday*.
- **Review ask** → `experience = positive`, ≥24h after the experience check, once.
- **Recovery** → `experience = no_show | negative`, next sweep after the reply.

`experience` is set by the webhook from the guest's reply (keyword classifier in
`whatsapp-webhook/index.ts` — swap in an LLM call there for more nuance), or by
you in the admin Follow-up tab. Set experience wins; the review ask never goes
to anyone who wasn't positive. STOP/unsubscribe sets `opted_out` globally.

## Testing before going live
1. `workflow_dispatch` the cron with only test RSVPs in an event dated
   yesterday → you should receive the experience check.
2. Reply "loved it!" from the test phone → `event_rsvps.experience` flips to
   `positive`, `experience_source = reply`, and `wa_messages` logs the inbound.
3. Re-run the sweep after 24h → the review ask arrives.
4. Reply "STOP" from another test row → `opted_out = true`, no more sends.

## Cost (India, approx — check Meta's current rate card)
Cloud API hosting is free; you pay per template message — marketing templates
run roughly ₹0.7–0.9 each, utility less. A few hundred guests per edition is
small money. User-initiated (service) messages are free.
