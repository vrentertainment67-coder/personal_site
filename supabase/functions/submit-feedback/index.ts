// =====================================================================
// The Vic Fix — submit-feedback edge function
// Deploy:  supabase functions deploy submit-feedback --no-verify-jwt
// Secrets: supabase secrets set IP_SALT="<long-random-string>"
//          (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-injected)
//
// The public form calls THIS, never the table directly. This function is
// the only writer, so rate-limiting, IP hashing, the abuse filter and the
// ban check can't be bypassed from the client.
// =====================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*", // tighten to your domain in prod
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Basic abuse filter. Extend this list as needed — it flags for review,
// it does NOT auto-reject, so borderline stuff still reaches your queue.
const ABUSE_TERMS = [
  // keep this list private; add slurs / targeted-harassment terms here
  // e.g. "example-slur",
];

const RATE_LIMIT = { windowMinutes: 10, maxPerWindow: 3 };

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// The fingerprint comes from the browser and is fully client-controlled. It is
// interpolated into a PostgREST `.or()` filter, where commas / dots / parens
// are query syntax — so an unsanitised value could break or subvert the ban and
// rate-limit checks (letting an abuser slip past both). A real FingerprintJS
// visitorId is alphanumeric, so we hard-restrict to a filter-safe charset.
function safeFingerprint(raw: unknown): string | null {
  const cleaned = String(raw ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 128);
  return cleaned.length ? cleaned : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Always return this to the client — success is indistinguishable whether
  // the message was queued, rate-limited, or silently banned. That's the point.
  const ok = () =>
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...CORS, "content-type": "application/json" },
    });

  try {
    const body = await req.json();
    const message = String(body.message ?? "").trim();
    const category = ["feedback", "idea", "question", "other"].includes(body.category)
      ? body.category
      : "feedback";
    const eventSlug = String(body.event_slug ?? "vicfix-2026").slice(0, 60);
    const fingerprint = safeFingerprint(body.fingerprint);

    if (!message || message.length > 2000) return ok(); // ignore junk silently

    // Server-side identity signals (honest abuse metadata).
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";
    const ipHash = await sha256(ip + (Deno.env.get("IP_SALT") ?? ""));
    const userAgent = req.headers.get("user-agent")?.slice(0, 400) ?? null;

    // Build the OR filter from sanitised parts only. fingerprint is restricted
    // to [A-Za-z0-9_-] above and ipHash is a hex digest, so neither can inject
    // PostgREST filter syntax.
    const orParts: string[] = [`ip_hash.eq.${ipHash}`];
    if (fingerprint) orParts.push(`fingerprint.eq.${fingerprint}`);
    const orFilter = orParts.join(",");

    // 1. Ban check — silent. Store as rejected, return success anyway.
    const { data: bans } = await admin
      .from("banned_identifiers")
      .select("id")
      .or(orFilter)
      .limit(1);
    const banned = !!(bans && bans.length);

    // 2. Rate limit by fingerprint OR ip_hash within the window.
    const since = new Date(Date.now() - RATE_LIMIT.windowMinutes * 60_000).toISOString();
    const { count } = await admin
      .from("event_feedback")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since)
      .or(orFilter);
    const rateLimited = (count ?? 0) >= RATE_LIMIT.maxPerWindow;
    if (rateLimited) return ok(); // silently drop the extra; user sees success

    // 3. Abuse filter — flags for review, does not block.
    const lower = message.toLowerCase();
    const hit = ABUSE_TERMS.find((t) => t && lower.includes(t));
    const flagged = !!hit;

    // 4. Insert. Banned -> rejected (never surfaces). Everyone else -> pending.
    //    Store the SANITISED fingerprint so future ban/rate matching is consistent.
    await admin.from("event_feedback").insert({
      event_slug: eventSlug,
      category,
      message,
      fingerprint,
      ip_hash: ipHash,
      user_agent: userAgent,
      status: banned ? "rejected" : "pending",
      flagged,
      flag_reason: banned ? "banned identifier" : hit ? "abuse term" : null,
    });

    return ok();
  } catch (_e) {
    return ok(); // never leak internals to the projector room
  }
});
