/**
 * Formspree → WhatsApp bridge (Supabase Edge Function, Deno runtime).
 *
 * Wired client-side by src/layouts/Layout.astro's global submit hook, which
 * mirrors every Formspree submission to this endpoint via navigator.sendBeacon.
 * This function calls CallMeBot's free WhatsApp API so DJ VIC's phone buzzes
 * whenever someone submits any Formspree form on djvicofficial.com.
 *
 * ── Required env vars (set via Supabase dashboard or CLI) ──
 *   CALLMEBOT_API_KEY — the key CallMeBot DM's you after the activation message
 *   CALLMEBOT_PHONE   — destination, digits only (defaults to 919611711677)
 *
 * ── Activate CallMeBot first ──
 *   1. Save +34 613 01 49 37 in your contacts
 *      (the number rotates — if it fails, check
 *       https://www.callmebot.com/blog/free-api-whatsapp-messages/)
 *   2. WhatsApp it: "I allow callmebot to send me messages"
 *   3. It replies with your API key within ~2 minutes.
 *
 * ── Deploy ──
 *   supabase functions deploy notify --no-verify-jwt
 *   supabase secrets set CALLMEBOT_API_KEY=<the-key-from-step-3>
 *   # optional, defaults to 919611711677
 *   supabase secrets set CALLMEBOT_PHONE=919611711677
 *
 *   --no-verify-jwt is required because sendBeacon cannot attach Authorization
 *   headers from the browser. Anti-abuse is enforced by the Origin allowlist
 *   below instead.
 */

const ALLOWED_ORIGINS: RegExp[] = [
  /^https?:\/\/(?:www\.)?djvicofficial\.com$/,
  /^https:\/\/[\w-]+\.github\.io$/,        // GitHub Pages preview/staging
  /^http:\/\/localhost(?::\d+)?$/,         // local dev
];

const FIELD_ORDER = [
  "name",
  "phone",
  "email",
  "event_type",
  "event_date",
  "event_name",
  "event_venue",
  "city",
  "guests",
  "role",
  "instagram",
  "message",
  "story",
];

const FIELD_LABELS: Record<string, string> = {
  event_type:  "Event",
  event_date:  "Date",
  event_name:  "Event",
  event_venue: "Venue",
};

Deno.serve(async (req: Request): Promise<Response> => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const source = req.headers.get("origin") || req.headers.get("referer") || "";
  const allowed = ALLOWED_ORIGINS.some((re) => re.test(source));
  if (!allowed) {
    return new Response("forbidden", { status: 403 });
  }

  const apiKey = Deno.env.get("CALLMEBOT_API_KEY");
  const phone  = Deno.env.get("CALLMEBOT_PHONE") || "919611711677";
  if (!apiKey) {
    console.error("[notify] CALLMEBOT_API_KEY not set — dropping submission");
    return new Response("ok", { status: 200, headers: corsHeaders(req) });
  }

  let data: Record<string, unknown> = {};
  try {
    data = await req.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }

  const text = buildMessage(data);

  const url =
    "https://api.callmebot.com/whatsapp.php" +
    `?phone=${encodeURIComponent(phone)}` +
    `&text=${encodeURIComponent(text)}` +
    `&apikey=${encodeURIComponent(apiKey)}`;

  try {
    const res = await fetch(url, { method: "GET" });
    const body = await res.text().catch(() => "");
    console.log("[notify] callmebot", res.status, body.slice(0, 200));
  } catch (err) {
    console.error("[notify] callmebot fetch failed", err);
  }

  return new Response("ok", { status: 200, headers: corsHeaders(req) });
});

function corsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get("origin") || "";
  const allowed = ALLOWED_ORIGINS.some((re) => re.test(origin));
  return {
    "Access-Control-Allow-Origin":  allowed ? origin : "https://djvicofficial.com",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

function inferFormType(d: Record<string, unknown>): string {
  if (d.story || d.role)                            return "New Podcast Guest Application";
  if (d.guests || d.event_venue)                    return "New Guest-List RSVP";
  if (d.event_type || d.event_date || d.city)       return "New Booking Enquiry";
  return "New Enquiry";
}

function labelize(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildMessage(data: Record<string, unknown>): string {
  const formType = inferFormType(data);
  const lines: string[] = [`🎧 ${formType}`, "— djvicofficial.com", ""];

  const seen = new Set<string>();
  for (const key of FIELD_ORDER) {
    const val = data[key];
    if (val == null || val === "") continue;
    lines.push(`${labelize(key)}: ${String(val).trim()}`);
    seen.add(key);
  }
  for (const [k, v] of Object.entries(data)) {
    if (seen.has(k) || k.startsWith("_")) continue;
    if (v == null || v === "") continue;
    lines.push(`${labelize(k)}: ${String(v).trim()}`);
  }

  if (data._page) {
    lines.push("");
    lines.push(`Page: ${data._page}`);
  }

  let msg = lines.join("\n");
  if (msg.length > 1400) msg = msg.slice(0, 1390) + "\n…";
  return msg;
}
