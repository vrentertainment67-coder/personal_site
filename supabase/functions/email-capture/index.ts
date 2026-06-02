// ============================================================
// DJ VIC — email capture → MailerLite
// Public endpoint. Adds a subscriber to the "Website Subscribers"
// group (id 189188109806601371) via the MailerLite connect API.
//
// Deploy:  supabase functions deploy email-capture --no-verify-jwt
// Secret:  supabase secrets set MAILERLITE_API_KEY=ml_xxx
//
// POST body: { email, name?, source?, hp? }
//   hp  = honeypot; if filled we pretend success and drop it.
// ============================================================

const GROUP_ID = "189188109806601371"; // Website Subscribers
const ML_API = "https://connect.mailerlite.com/api/subscribers";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  const email = String(payload.email ?? "").trim().toLowerCase();
  const name = String(payload.name ?? "").trim();
  const source = String(payload.source ?? "website").trim().slice(0, 80);
  const hp = String(payload.hp ?? "").trim();

  // Honeypot tripped → silently accept, do nothing.
  if (hp) return json({ ok: true });

  if (!EMAIL_RE.test(email)) return json({ error: "invalid_email" }, 400);

  const API_KEY = Deno.env.get("MAILERLITE_API_KEY");
  if (!API_KEY) return json({ error: "not_configured" }, 500);

  const body: Record<string, unknown> = {
    email,
    groups: [GROUP_ID],
    fields: { source },
  };
  if (name) (body.fields as Record<string, unknown>).name = name;

  try {
    const r = await fetch(ML_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    // 200/201 = created/updated. 422 from ML usually means "already subscribed"
    // for a valid email — treat as success so the visitor sees a friendly state.
    if (r.ok || r.status === 422) return json({ ok: true });

    const txt = await r.text();
    return json({ error: "mailerlite_error", status: r.status, detail: txt.slice(0, 300) }, 502);
  } catch (e) {
    return json({ error: "fetch_failed", detail: String(e).slice(0, 200) }, 502);
  }
});
