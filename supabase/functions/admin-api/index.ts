// ============================================================
// DJ VIC — Admin API (Edge Function)
// Deploy:  supabase functions deploy admin-api  (keep JWT verify ON or OFF;
//          this function checks the caller's login itself either way)
// Repo path: supabase/functions/admin-api/index.ts
//
// ACTIONS (all require Vic to be signed in)
//   action=sign-upload  -> returns a Cloudinary signed-upload payload
//   action=seo-stats    -> returns top GSC queries/pages (last 28 days)
//
// SECRETS (supabase secrets set ...)
//   CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
//   GSC_SITE_URL                e.g. "sc-domain:djvicofficial.com"
//   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN
//     ^ the refresh token must include the Search Console scope:
//       https://www.googleapis.com/auth/webmasters.readonly
//       (re-run the OAuth playground with BOTH calendar + webmasters scopes
//        and update GOOGLE_REFRESH_TOKEN, so calendar-sync keeps working too)
//   SUPABASE_URL / SUPABASE_ANON_KEY  (auto)
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CLOUD = Deno.env.get("CLOUDINARY_CLOUD_NAME")!;
const CLD_KEY = Deno.env.get("CLOUDINARY_API_KEY")!;
const CLD_SECRET = Deno.env.get("CLOUDINARY_API_SECRET")!;
const GSC_SITE = Deno.env.get("GSC_SITE_URL") ?? "";
const G_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const G_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const G_REFRESH = Deno.env.get("GOOGLE_REFRESH_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

async function requireVic(req: Request): Promise<boolean> {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  const supa = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
  const { data, error } = await supa.auth.getUser();
  return !error && !!data.user;
}

async function sha1Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Cloudinary signed upload: sign the sorted params + api_secret
async function signUpload(folder: string) {
  const timestamp = Math.floor(Date.now() / 1000);
  const toSign = `folder=${folder}&timestamp=${timestamp}`; // alphabetical order
  const signature = await sha1Hex(toSign + CLD_SECRET);
  return json({
    cloudName: CLOUD,
    apiKey: CLD_KEY,
    timestamp,
    folder,
    signature,
    uploadUrl: `https://api.cloudinary.com/v1_1/${CLOUD}/auto/upload`,
  });
}

async function googleToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: G_ID, client_secret: G_SECRET,
      refresh_token: G_REFRESH, grant_type: "refresh_token",
    }),
  });
  const d = await res.json();
  if (!d.access_token) throw new Error("Google token error: " + JSON.stringify(d));
  return d.access_token;
}

async function seoStats() {
  if (!GSC_SITE) return json({ connected: false, reason: "GSC_SITE_URL not set" });
  const token = await googleToken();
  const end = new Date();
  const start = new Date(); start.setDate(end.getDate() - 28);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  async function run(body: Record<string, unknown>) {
    const res = await fetch(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(GSC_SITE)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: fmt(start), endDate: fmt(end), ...body }),
      },
    );
    return await res.json();
  }
  const map = (rows: any[]) => (rows ?? []).map((r: any) => ({
    key: r.keys?.[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position,
  }));

  const [q, p, t] = await Promise.all([
    run({ dimensions: ["query"], rowLimit: 25 }),
    run({ dimensions: ["page"], rowLimit: 25 }),
    run({ rowLimit: 1 }), // totals (no dimension)
  ]);
  if (q.error) return json({ connected: false, reason: q.error.message });
  const tot = (t.rows ?? [])[0] ?? {};
  return json({
    connected: true,
    range: { from: fmt(start), to: fmt(end) },
    queries: map(q.rows), pages: map(p.rows),
    totals: { clicks: tot.clicks ?? 0, impressions: tot.impressions ?? 0, ctr: tot.ctr ?? 0, position: tot.position ?? 0 },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!(await requireVic(req))) return json({ error: "Not authorized" }, 401);
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    if (action === "sign-upload") {
      const { folder } = await req.json().catch(() => ({ folder: "djvic" }));
      return await signUpload(folder || "djvic");
    }
    if (action === "seo-stats") return await seoStats();

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
