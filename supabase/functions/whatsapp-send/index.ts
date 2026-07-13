// ============================================================
// DJ VIC — whatsapp-send edge function
// Sends the Chamatkar post-event follow-up over the WhatsApp Business
// Cloud API (Meta Graph). Business-initiated sends MUST use pre-approved
// templates, so every stage here maps to a template you create once in
// Meta Business Manager (names + variables in whatsapp_followup.md).
//
// It relays to Meta and writes lifecycle state back to event_rsvps —
// idempotently (it checks the *_sent_at columns first, so re-runs and the
// daily cron never double-send).
//
// Deploy:  supabase functions deploy whatsapp-send --no-verify-jwt
// Secrets:
//   WHATSAPP_TOKEN            permanent System-User token (Meta)
//   WHATSAPP_PHONE_NUMBER_ID  the sender number's Phone Number ID (Meta)
//   WHATSAPP_API_VERSION      optional, defaults to v21.0
//   CRON_SECRET               shared secret the GitHub Actions cron sends
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY  (auto)
//
// Auth: a logged-in admin (Bearer JWT) OR the cron (x-cron-secret header).
//
// Actions (POST ?action=...):
//   send    { id, stage }          -> one RSVP, one stage
//   batch   { event, stage }       -> every eligible RSVP for an event
//   cron    {}                     -> daily sweep: reminders (day-before),
//                                     step1 (morning-after), review (positive,
//                                     1-2 days on), recovery (no-show/negative)
// Stages: 'reminder' | 'step1' | 'review' | 'recovery'
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TOKEN = Deno.env.get("WHATSAPP_TOKEN");
const PHONE_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
const API_VER = Deno.env.get("WHATSAPP_API_VERSION") || "v21.0";
const CRON_SECRET = Deno.env.get("CRON_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const DEFAULT_REVIEW_LINK = "https://g.page/r/CZKKtBcBFJH4EAE/review";

// Stage → the Meta template you must create + get approved (see the .md).
// `vars` builds the ordered body {{1}},{{2}}… parameters from the RSVP + event.
const TEMPLATES: Record<string, { name: string; lang: string; vars: (r: any, ev: any) => string[] }> = {
  reminder: {
    name: "chamatkar_reminder",
    lang: "en",
    vars: (r, ev) => [firstName(r) || "there", ev?.title || "Chamatkar", ev?.date_label || "the night", ev?.venue || "the venue"],
  },
  step1: {
    name: "chamatkar_experience_check",
    lang: "en",
    vars: (r, ev) => [firstName(r) || "there", ev?.title || "Chamatkar"],
  },
  review: {
    name: "chamatkar_review_ask",
    lang: "en",
    vars: (r, ev) => [ev?.title || "Chamatkar", ev?.review_link || DEFAULT_REVIEW_LINK],
  },
  recovery_noshow: {
    name: "chamatkar_recovery_noshow",
    lang: "en",
    vars: (r, ev) => [ev?.title || "Chamatkar"],
  },
  recovery_negative: {
    name: "chamatkar_recovery_negative",
    lang: "en",
    vars: () => [],
  },
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

function firstName(r: any): string {
  return String(r?.name || "").trim().split(/\s+/)[0] || "";
}
// India-friendly E.164 (no +): 10 digits → prefix 91.
function waPhone(p: string): string {
  let n = String(p || "").replace(/\D/g, "");
  if (n.length === 10) n = "91" + n;
  return n;
}

async function requireAdmin(req: Request): Promise<boolean> {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  const supa = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
  const { data, error } = await supa.auth.getUser();
  return !error && !!data.user;
}
function isCron(req: Request): boolean {
  return !!CRON_SECRET && req.headers.get("x-cron-secret") === CRON_SECRET;
}

const admin = () => createClient(SUPABASE_URL, SERVICE_KEY);
// Best-effort await — supabase query builders are thenables (no .catch), so
// swallow failures on non-critical writes without crashing the request.
async function quiet(p: PromiseLike<unknown>) { try { await p; } catch (_) { /* ignore */ } }

// Which recovery variant a row needs, or null if it's not in recovery.
function recoveryStage(r: any): "recovery_noshow" | "recovery_negative" | null {
  if (r.experience === "no_show") return "recovery_noshow";
  if (r.experience === "negative") return "recovery_negative";
  return null;
}

// Send one template message via the Cloud API + log it + stamp the row.
async function sendStage(r: any, ev: any, stage: string): Promise<{ ok: boolean; detail?: unknown }> {
  const tplKey = stage === "recovery" ? recoveryStage(r) : stage;
  const tpl = tplKey ? TEMPLATES[tplKey] : null;
  if (!tpl) return { ok: false, detail: "no template for stage " + stage };

  const to = waPhone(r.phone);
  if (to.length < 11) return { ok: false, detail: "invalid phone" };

  const params = tpl.vars(r, ev);
  const body: Record<string, unknown> = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: tpl.name,
      language: { code: tpl.lang },
      ...(params.length
        ? { components: [{ type: "body", parameters: params.map((t) => ({ type: "text", text: String(t) })) }] }
        : {}),
    },
  };

  const res = await fetch(`https://graph.facebook.com/${API_VER}/${PHONE_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const out = await res.json().catch(() => ({}));
  const waId = out?.messages?.[0]?.id;
  const ok = res.ok && !!waId;

  const db = admin();
  await quiet(db.from("wa_messages").insert({
    rsvp_id: r.id, event: r.event, phone: to, direction: "out",
    stage, template: tpl.name, wa_message_id: waId ?? null,
    status: ok ? "sent" : "failed", body: params.join(" · ") || tpl.name,
    detail: ok ? null : JSON.stringify(out).slice(0, 400),
  }));

  if (ok) {
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { last_message_at: now };
    if (stage === "reminder") patch.reminder_sent_at = now;
    else if (stage === "step1") patch.followup1_sent_at = now;
    else if (stage === "review") { patch.followup2_sent_at = now; patch.review_requested_at = now; }
    else if (stage === "recovery") patch.followup2_sent_at = now;
    await quiet(db.from("event_rsvps").update(patch).eq("id", r.id));
  }
  return { ok, detail: ok ? undefined : out };
}

const isSendable = (r: any) => !r.opted_out && r.consent_followup !== false && waPhone(r.phone).length >= 11;

// Is a stage still pending for this row? (idempotency gate)
function pending(r: any, stage: string): boolean {
  if (!isSendable(r)) return false;
  if (stage === "reminder") return !r.reminder_sent_at;
  if (stage === "step1") return !r.followup1_sent_at;
  if (stage === "review") return r.experience === "positive" && !r.review_requested_at;
  if (stage === "recovery") return (r.experience === "no_show" || r.experience === "negative") && !r.followup2_sent_at;
  return false;
}

async function eventBySlug(slug: string) {
  const { data } = await admin().from("events").select("*").eq("slug", slug).maybeSingle();
  return data;
}

async function batchStage(slug: string, stage: string) {
  const ev = await eventBySlug(slug);
  const { data: rows } = await admin().from("event_rsvps").select("*").eq("event", slug);
  const todo = (rows || []).filter((r) => pending(r, stage));
  let sent = 0, failed = 0;
  for (const r of todo) {
    const res = await sendStage(r, ev, stage);
    res.ok ? sent++ : failed++;
    await new Promise((r) => setTimeout(r, 250)); // stagger — avoid spam flags
  }
  return { event: slug, stage, eligible: todo.length, sent, failed };
}

// Daily sweep. Reminders go the day before; step1 the morning after; review
// 1-2 days after a positive reply; recovery on the next run after the branch.
async function cronSweep() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);

  const { data: events } = await admin().from("events").select("*");
  const evs = events || [];
  const dateOf = (ev: any) => (ev.expiry ? new Date(ev.expiry) : null);
  const results: unknown[] = [];

  for (const ev of evs) {
    const d = dateOf(ev); if (!d) continue;
    const day = iso(d);
    if (day === iso(tomorrow)) results.push(await batchStage(ev.slug, "reminder"));
    if (day === iso(yesterday)) results.push(await batchStage(ev.slug, "step1"));
  }

  // Review + recovery are driven by `experience` (set by the webhook), not the
  // calendar — sweep every recent event so branches fire once their time comes.
  const cutoff = new Date(today); cutoff.setDate(today.getDate() - 21);
  for (const ev of evs) {
    const d = dateOf(ev); if (!d || d < cutoff) continue;
    // review: only 1-2 days after the experience check went out
    const { data: rows } = await admin().from("event_rsvps").select("*").eq("event", ev.slug);
    const readyReview = (rows || []).filter((r) =>
      pending(r, "review") && r.followup1_sent_at &&
      (Date.now() - new Date(r.followup1_sent_at).getTime()) >= 24 * 3600 * 1000);
    for (const r of readyReview) { await sendStage(r, ev, "review"); await new Promise((x) => setTimeout(x, 250)); }
    const readyRecover = (rows || []).filter((r) => pending(r, "recovery"));
    for (const r of readyRecover) { await sendStage(r, ev, "recovery"); await new Promise((x) => setTimeout(x, 250)); }
    if (readyReview.length || readyRecover.length)
      results.push({ event: ev.slug, review: readyReview.length, recovery: readyRecover.length });
  }
  return { swept: evs.length, results };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!(await requireAdmin(req)) && !isCron(req)) return json({ error: "Not authorized" }, 401);
    if (!TOKEN || !PHONE_ID) return json({ error: "WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID not configured" }, 500);

    const action = new URL(req.url).searchParams.get("action");

    if (action === "cron") return json(await cronSweep());

    if (action === "batch") {
      const b = await req.json().catch(() => ({}));
      if (!b?.event || !b?.stage) return json({ error: "event, stage required" }, 400);
      return json(await batchStage(b.event, b.stage));
    }

    if (action === "send") {
      const b = await req.json().catch(() => ({}));
      if (!b?.id || !b?.stage) return json({ error: "id, stage required" }, 400);
      const { data: r } = await admin().from("event_rsvps").select("*").eq("id", b.id).maybeSingle();
      if (!r) return json({ error: "RSVP not found" }, 404);
      if (!pending(r, b.stage)) return json({ ok: true, skipped: "already sent / not eligible" });
      const ev = await eventBySlug(r.event);
      const res = await sendStage(r, ev, b.stage);
      return res.ok ? json({ ok: true }) : json({ error: "send failed", detail: res.detail }, 502);
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
