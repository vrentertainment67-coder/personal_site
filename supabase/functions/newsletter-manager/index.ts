// ============================================================
// DJ VIC — newsletter-manager edge function
// Deploy: supabase functions deploy newsletter-manager --no-verify-jwt
// Secrets: RESEND_API_KEY (+ auto-injected SUPABASE_*)
//
// Public actions (no JWT):
//   POST action=subscribe  { email, name?, source?, list?, hp? }
//
// Auth-required actions (pass Authorization: Bearer <token>):
//   GET  action=contacts        [?q=search]
//   POST action=add-contact     { email, name?, list? }
//   POST action=remove-contact  { email }
//   POST action=setup-audiences              → creates Resend audiences
//   GET  action=audiences-status
//   POST action=draft  { subject, html, audience }  → creates Resend broadcast draft
//   POST action=send   { broadcastId }              → sends the broadcast
//   GET  action=history
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_API = "https://api.resend.com";
const FROM = "DJ VIC <bookings@djvicofficial.com>";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

// ── Supabase client (always service role for full table access) ──────────
function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

// ── Verify caller is a logged-in admin ──────────────────────────────────
async function getUser(req: Request) {
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } },
  );
  const { data } = await sb.auth.getUser();
  return data.user;
}

// ── Resend API helper ────────────────────────────────────────────────────
async function resend(path: string, method: string, body?: unknown) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) throw new Error("RESEND_API_KEY not configured");
  const r = await fetch(`${RESEND_API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let data: unknown;
  try { data = await r.json(); } catch { data = await r.text(); }
  return { ok: r.ok, status: r.status, data };
}

// ── Config helper ────────────────────────────────────────────────────────
async function getConfig(sb: ReturnType<typeof adminClient>) {
  const { data } = await sb.from("newsletter_config").select("key, value");
  return Object.fromEntries((data ?? []).map((r: Record<string, string>) => [r.key, r.value]));
}

// ── Sync a contact to Resend audience (non-fatal) ────────────────────────
async function syncToResend(audienceId: string, email: string, name?: string) {
  await resend(`/audiences/${audienceId}/contacts`, "POST", {
    email,
    first_name: name?.split(" ")[0] || undefined,
    unsubscribed: false,
  }).catch(() => {});
}

// ════════════════════════════════════════════════════════════════════════
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = new URL(req.url);
  let action = url.searchParams.get("action") || "";

  // Read JSON body once (clone so we can re-read later if needed)
  let payload: Record<string, unknown> = {};
  if (req.method === "POST" || req.method === "DELETE") {
    try { payload = await req.json(); } catch { /* optional body */ }
  }

  if (!action) action = String(payload.action ?? "");

  // ── PUBLIC: subscribe ─────────────────────────────────────────────────
  if (action === "subscribe") {
    const email  = String(payload.email  ?? "").trim().toLowerCase();
    const name   = String(payload.name   ?? "").trim();
    const source = String(payload.source ?? "website").trim().slice(0, 80);
    const list   = ["weekly", "monthly", "both"].includes(String(payload.list)) ? String(payload.list) : "monthly";
    const hp     = String(payload.hp ?? "").trim();

    if (hp) return json({ ok: true }); // honeypot silently dropped
    if (!EMAIL_RE.test(email)) return json({ error: "invalid_email" }, 400);

    const sb = adminClient();
    const { error } = await sb.from("subscribers").upsert(
      { email, name: name || null, source, list },
      { onConflict: "email" },
    );
    if (error && error.code !== "23505") console.error("subscribe upsert:", error);

    // Sync to Resend audience (non-fatal)
    const config = await getConfig(sb);
    const audId  = list === "weekly" ? config.resend_audience_weekly : config.resend_audience_monthly;
    if (audId) await syncToResend(audId, email, name);

    return json({ ok: true });
  }

  // ── AUTH GATE ─────────────────────────────────────────────────────────
  const user = await getUser(req);
  if (!user) return json({ error: "unauthorized" }, 401);

  const sb = adminClient();

  // ── contacts ──────────────────────────────────────────────────────────
  if (action === "contacts") {
    const q = url.searchParams.get("q") || "";
    let query = sb.from("subscribers").select("*").order("subscribed_at", { ascending: false });
    if (q) query = query.or(`email.ilike.%${q}%,name.ilike.%${q}%`);
    const { data, error } = await query;
    if (error) return json({ error: error.message }, 500);
    return json({ subscribers: data ?? [], count: data?.length ?? 0 });
  }

  // ── add-contact ───────────────────────────────────────────────────────
  if (action === "add-contact") {
    const email = String(payload.email ?? "").trim().toLowerCase();
    const list  = String(payload.list  ?? "monthly");
    if (!EMAIL_RE.test(email)) return json({ error: "invalid_email" }, 400);

    const { error } = await sb.from("subscribers").upsert(
      { email, name: payload.name || null, source: "manual", list },
      { onConflict: "email" },
    );
    if (error) return json({ error: error.message }, 500);

    const config = await getConfig(sb);
    const audId  = list === "weekly" ? config.resend_audience_weekly : config.resend_audience_monthly;
    if (audId) await syncToResend(audId, email, String(payload.name ?? ""));

    return json({ ok: true });
  }

  // ── remove-contact ────────────────────────────────────────────────────
  if (action === "remove-contact") {
    const email = String(payload.email ?? "");
    const { error } = await sb.from("subscribers")
      .update({ status: "unsubscribed" }).eq("email", email);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  // ── audiences-status ──────────────────────────────────────────────────
  if (action === "audiences-status") {
    const config = await getConfig(sb);
    return json({
      monthly: config.resend_audience_monthly ?? null,
      weekly:  config.resend_audience_weekly  ?? null,
    });
  }

  // ── setup-audiences ───────────────────────────────────────────────────
  if (action === "setup-audiences") {
    const results: Record<string, unknown> = {};

    const m = await resend("/audiences", "POST", { name: "DJ VIC - Monthly" });
    if (m.ok) {
      const id = (m.data as Record<string, string>).id;
      await sb.from("newsletter_config").upsert({ key: "resend_audience_monthly", value: id });
      results.monthly = id;
    } else { results.monthly_error = m.data; }

    const w = await resend("/audiences", "POST", { name: "Vic Fix - Weekly" });
    if (w.ok) {
      const id = (w.data as Record<string, string>).id;
      await sb.from("newsletter_config").upsert({ key: "resend_audience_weekly", value: id });
      results.weekly = id;
    } else { results.weekly_error = w.data; }

    return json({ ok: true, ...results });
  }

  // ── draft ─────────────────────────────────────────────────────────────
  if (action === "draft") {
    const { subject, html, audience = "monthly" } = payload as Record<string, string>;
    if (!subject || !html) return json({ error: "subject and html are required" }, 400);

    const config = await getConfig(sb);
    const audId  = audience === "weekly" ? config.resend_audience_weekly : config.resend_audience_monthly;
    if (!audId) return json({ error: "audience_not_configured — run setup-audiences first" }, 400);

    // Sync active subscribers of this list to Resend audience
    const listFilter = audience === "weekly"
      ? "list.eq.weekly,list.eq.both"
      : "list.eq.monthly,list.eq.both";
    const { data: subs } = await sb.from("subscribers")
      .select("email, name")
      .eq("status", "active")
      .or(listFilter);

    for (const s of subs ?? []) {
      await syncToResend(audId, s.email, s.name ?? "");
    }

    // Create Resend broadcast (draft = not sent yet)
    const r = await resend("/broadcasts", "POST", {
      audience_id: audId,
      from: FROM,
      subject,
      html,
    });
    if (!r.ok) return json({ error: "resend_error", detail: r.data }, 502);

    const broadcastId    = (r.data as Record<string, string>).id;
    const recipientCount = subs?.length ?? 0;

    await sb.from("newsletter_drafts").insert({
      subject, html, audience, status: "draft",
      resend_broadcast_id: broadcastId,
      recipient_count: recipientCount,
    });

    return json({ ok: true, broadcastId, recipientCount });
  }

  // ── send ──────────────────────────────────────────────────────────────
  if (action === "send") {
    const { broadcastId } = payload as Record<string, string>;
    if (!broadcastId) return json({ error: "broadcastId required" }, 400);

    const r = await resend(`/broadcasts/${broadcastId}/send`, "POST", {});
    if (!r.ok) return json({ error: "resend_error", detail: r.data }, 502);

    await sb.from("newsletter_drafts")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("resend_broadcast_id", broadcastId);

    return json({ ok: true });
  }

  // ── history ───────────────────────────────────────────────────────────
  if (action === "history") {
    const { data, error } = await sb.from("newsletter_drafts")
      .select("id, subject, audience, status, created_at, sent_at, recipient_count, resend_broadcast_id")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return json({ error: error.message }, 500);
    return json({ history: data ?? [] });
  }

  return json({ error: "unknown_action" }, 400);
});
