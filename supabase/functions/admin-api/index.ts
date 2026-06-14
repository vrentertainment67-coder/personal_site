// ============================================================
// DJ VIC — Admin API (Edge Function)
// Deploy:  supabase functions deploy admin-api  (keep JWT verify ON or OFF;
//          this function checks the caller's login itself either way)
// Repo path: supabase/functions/admin-api/index.ts
//
// ACTIONS (all require Vic to be signed in)
//   action=sign-upload  -> returns a Cloudinary signed-upload payload
//   action=seo-stats    -> returns top GSC queries/pages (last 28 days)
//   action=ga-stats     -> returns GA4 traffic (users/sessions/channels/pages/
//                          devices/cities, last 28 days) via the GA4 Data API
//
// SECRETS (supabase secrets set ...)
//   CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
//   GSC_SITE_URL                e.g. "sc-domain:djvicofficial.com"
//   GA4_PROPERTY_ID             numeric GA4 property id (defaults to 422308749)
//   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN
//     ^ the refresh token must include ALL of these scopes:
//       https://www.googleapis.com/auth/webmasters.readonly   (GSC)
//       https://www.googleapis.com/auth/analytics.readonly     (GA4 ga-stats)
//       https://www.googleapis.com/auth/calendar               (calendar-sync)
//       Re-run the OAuth consent with all three and update GOOGLE_REFRESH_TOKEN.
//       Also enable the "Analytics Data API" in the Google Cloud project.
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
const GA4_PROP = Deno.env.get("GA4_PROPERTY_ID") ?? "422308749";
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

// GA4 Data API — traffic insight (last 28 days). Needs the refresh token to
// include scope https://www.googleapis.com/auth/analytics.readonly and the
// Analytics Data API enabled in the Google Cloud project.
async function gaStats() {
  let token: string;
  try { token = await googleToken(); } catch (e) { return json({ connected: false, reason: String(e) }); }
  const endpoint = `https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROP}:runReport`;
  const run = async (body: Record<string, unknown>) => {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return await res.json();
  };
  const dateRanges = [{ startDate: "28daysAgo", endDate: "today" }];
  const order = (m: string) => [{ metric: { metricName: m }, desc: true }];

  const [totals, channels, pages, devices, cities] = await Promise.all([
    run({ dateRanges, metrics: [{ name: "activeUsers" }, { name: "sessions" }, { name: "screenPageViews" }, { name: "averageSessionDuration" }] }),
    run({ dateRanges, dimensions: [{ name: "sessionDefaultChannelGroup" }], metrics: [{ name: "sessions" }], orderBys: order("sessions"), limit: 8 }),
    run({ dateRanges, dimensions: [{ name: "pagePath" }], metrics: [{ name: "screenPageViews" }], orderBys: order("screenPageViews"), limit: 10 }),
    run({ dateRanges, dimensions: [{ name: "deviceCategory" }], metrics: [{ name: "sessions" }], orderBys: order("sessions"), limit: 5 }),
    run({ dateRanges, dimensions: [{ name: "city" }], metrics: [{ name: "activeUsers" }], orderBys: order("activeUsers"), limit: 8 }),
  ]);

  if (totals.error) return json({ connected: false, reason: totals.error.message || "GA4 Data API error" });

  const t0 = (totals.rows ?? [])[0]?.metricValues ?? [];
  const num = (i: number) => Number(t0[i]?.value ?? 0);
  const rowsOf = (rep: any) => (rep?.rows ?? []).map((r: any) => ({ key: r.dimensionValues?.[0]?.value || "(none)", value: Number(r.metricValues?.[0]?.value ?? 0) }));

  return json({
    connected: true,
    range: "Last 28 days",
    totals: { users: num(0), sessions: num(1), views: num(2), avgDuration: Math.round(num(3)) },
    channels: rowsOf(channels),
    pages: rowsOf(pages),
    devices: rowsOf(devices),
    cities: rowsOf(cities),
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
    if (action === "ga-stats") return await gaStats();

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
