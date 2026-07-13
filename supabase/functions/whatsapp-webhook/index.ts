// ============================================================
// DJ VIC — whatsapp-webhook edge function
// Receives inbound WhatsApp replies + delivery statuses from Meta's Cloud
// API. On a reply it classifies the sentiment, sets `experience` on the
// matching RSVP (which routes the follow-up to the review ask vs. recovery),
// honours STOP/unsubscribe, and stores the reply verbatim. Delivery-status
// callbacks update the wa_messages log.
//
// It does NOT send anything — the daily whatsapp-send cron fires the review
// ask (1-2 days after a positive reply) and recovery from the `experience`
// this function sets. That keeps the review ask off anyone who wasn't happy.
//
// Deploy:  supabase functions deploy whatsapp-webhook --no-verify-jwt
// Secrets:
//   WHATSAPP_VERIFY_TOKEN     the token you enter in Meta's webhook config
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY  (auto)
//
// Meta webhook config → Callback URL:
//   https://<project>.functions.supabase.co/whatsapp-webhook
//   Verify token: WHATSAPP_VERIFY_TOKEN ; subscribe to the "messages" field.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = () => createClient(SUPABASE_URL, SERVICE_KEY);
// Best-effort await — supabase query builders are thenables (no .catch).
async function quiet(p: PromiseLike<unknown>) { try { await p; } catch (_) { /* ignore */ } }

// Keyword sentiment. no_show is checked first ("couldn't come" outranks any
// stray positive word), then negative, then positive; anything else is left
// unclear for the admin to eyeball. Swap in an LLM call here for more nuance.
function classify(text: string): "positive" | "negative" | "no_show" | "unclear" {
  const t = " " + text.toLowerCase() + " ";
  if (/(couldn'?t|could not|didn'?t|did not|couldnt|didnt).{0,12}(come|make|made|attend|go|show)|missed it|not able to|next time|couldn'?t make/.test(t)) return "no_show";
  if (/disappoint|too crowded|over.?crowded|not (great|good|worth)|refund|worst|terrible|awful|long (queue|wait)|too (loud|expensive|packed)|\bmeh\b|waste/.test(t)) return "negative";
  if (/love|loved|lovin|amazing|awesome|great|greatest|blast|fire|🔥|best|fab|superb|10\/10|banger|brilliant|epic|so good|had fun|good time|vibe|insane|lit/.test(t)) return "positive";
  return "unclear";
}
function isStop(text: string): boolean {
  return /^\s*(stop|unsubscribe|opt.?out|remove me|do not message)\s*$/i.test(text);
}
function last10(p: string): string {
  return String(p || "").replace(/\D/g, "").slice(-10);
}

async function matchRsvp(fromDigits: string) {
  const key = last10(fromDigits);
  if (key.length < 10) return null;
  const { data } = await admin()
    .from("event_rsvps").select("*").ilike("phone", `%${key}%`)
    .order("created_at", { ascending: false });
  const rows = data || [];
  // Prefer someone we actually asked (followup1 sent); else the newest RSVP.
  return rows.find((r) => r.followup1_sent_at) || rows[0] || null;
}

async function handleInbound(msg: any) {
  const from = msg.from as string;
  const text = msg.text?.body || msg.button?.text || msg.interactive?.button_reply?.title || "";
  const r = await matchRsvp(from);
  const db = admin();

  await quiet(db.from("wa_messages").insert({
    rsvp_id: r?.id ?? null, event: r?.event ?? null, phone: from,
    direction: "in", body: text.slice(0, 1000), wa_message_id: msg.id ?? null,
  }));

  if (!r) return;

  if (isStop(text)) {
    await quiet(db.from("event_rsvps").update({ opted_out: true, reply_text: text.slice(0, 1000), last_message_at: new Date().toISOString() }).eq("id", r.id));
    return;
  }

  const patch: Record<string, unknown> = { reply_text: text.slice(0, 1000), last_message_at: new Date().toISOString() };
  // Only set experience from the reply if the admin/check-in hasn't already.
  if (!r.experience || r.experience === "unknown") {
    const sentiment = classify(text);
    if (sentiment !== "unclear") {
      patch.experience = sentiment;
      patch.experience_source = "reply";
      patch.attended = sentiment === "no_show" ? false : true;
    }
  }
  await quiet(db.from("event_rsvps").update(patch).eq("id", r.id));
}

async function handleStatus(st: any) {
  const waId = st.id;
  if (!waId) return;
  await quiet(admin().from("wa_messages")
    .update({ status: st.status, detail: st.errors ? JSON.stringify(st.errors).slice(0, 400) : null })
    .eq("wa_message_id", waId));
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Meta webhook verification handshake.
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token && token === VERIFY_TOKEN) {
      return new Response(challenge ?? "", { status: 200 });
    }
    return new Response("forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("ok", { status: 200 });

  try {
    const body = await req.json();
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const v = change.value || {};
        for (const msg of v.messages || []) {
          if (msg.type === "text" || msg.button || msg.interactive) await handleInbound(msg);
        }
        for (const st of v.statuses || []) await handleStatus(st);
      }
    }
  } catch (_) { /* never make Meta retry on our parse errors */ }

  // Always 200 — Meta retries aggressively on any non-200.
  return new Response("ok", { status: 200 });
});
