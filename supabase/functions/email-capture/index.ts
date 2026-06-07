// ============================================================
// DJ VIC — email capture → Supabase subscribers + Resend
// Public endpoint (no JWT). Writes to the `subscribers` table
// and syncs to the appropriate Resend audience.
//
// Deploy:  supabase functions deploy email-capture --no-verify-jwt
// Secrets: RESEND_API_KEY (same key used by newsletter-manager)
//
// POST body: { email, name?, source?, list?, hp? }
//   list = "monthly" | "weekly" | "both"  (default: "monthly")
//   hp   = honeypot; if filled we pretend success and drop it.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_API = "https://api.resend.com";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let payload: Record<string, unknown> = {};
  try { payload = await req.json(); }
  catch { return json({ error: "bad_json" }, 400); }

  const email  = String(payload.email  ?? "").trim().toLowerCase();
  const name   = String(payload.name   ?? "").trim();
  const source = String(payload.source ?? "website").trim().slice(0, 80);
  const list   = ["weekly", "monthly", "both"].includes(String(payload.list)) ? String(payload.list) : "monthly";
  const hp     = String(payload.hp ?? "").trim();

  if (hp) return json({ ok: true }); // honeypot — silent drop
  if (!EMAIL_RE.test(email)) return json({ error: "invalid_email" }, 400);

  // ── Write to Supabase subscribers table (service role bypasses RLS) ──
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { error: dbErr } = await sb.from("subscribers").upsert(
    { email, name: name || null, source, list },
    { onConflict: "email" },
  );
  if (dbErr && dbErr.code !== "23505") {
    console.error("subscribers upsert:", dbErr);
  }

  // ── Sync to Resend audience (non-fatal) ─────────────────────────────
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (resendKey) {
    const { data: cfg } = await sb.from("newsletter_config").select("key, value");
    const config: Record<string, string> = Object.fromEntries(
      (cfg ?? []).map((r: Record<string, string>) => [r.key, r.value]),
    );
    const audId = list === "weekly" ? config.resend_audience_weekly : config.resend_audience_monthly;
    if (audId) {
      await fetch(`${RESEND_API}/audiences/${audId}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
        body: JSON.stringify({
          email,
          first_name: name?.split(" ")[0] || undefined,
          unsubscribed: false,
        }),
      }).catch(() => {}); // non-fatal
    }
  }

  return json({ ok: true });
});
