// ============================================================
// DJ VIC — instagram-stats edge function
// Pulls a public Instagram profile's follower count (and verified / post
// count) for the Guest Pipeline. Backed by Apify's instagram-profile-scraper
// so it works reliably from a server IP (the free public endpoint 429s).
//
// Deploy:  supabase functions deploy instagram-stats --no-verify-jwt
// Secrets:
//   APIFY_TOKEN   your Apify API token (Apify console → Settings → API tokens)
//   SUPABASE_URL / SUPABASE_ANON_KEY  (auto)
//
// POST { handle }  ->  { username, fullName, followers, verified, posts,
//                        private, profilePic }   (admin only)
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const APIFY_TOKEN = Deno.env.get("APIFY_TOKEN");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

// "@handle", "https://instagram.com/handle/", "handle?hl=en" -> "handle"
function cleanHandle(raw: string): string {
  let h = (raw || "").trim();
  h = h.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "");
  h = h.replace(/^@/, "").replace(/[/?#].*$/, "").trim();
  return h.toLowerCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!(await requireVic(req))) return json({ error: "Not authorized" }, 401);
    if (!APIFY_TOKEN) return json({ error: "Apify isn't configured yet — add the APIFY_TOKEN secret. You can still enter followers manually." }, 503);

    const body = await req.json().catch(() => ({}));
    const handle = cleanHandle(body?.handle || "");
    if (!handle) return json({ error: "Give an Instagram handle." }, 400);

    // Run the scraper synchronously and get the dataset items back in one call.
    const r = await fetch(
      `https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items?token=${APIFY_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernames: [handle] }),
      },
    );

    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      return json({ error: `Apify error (HTTP ${r.status}).`, detail: detail.slice(0, 300) }, 502);
    }

    const items = await r.json().catch(() => []);
    const p = Array.isArray(items) ? items[0] : null;
    if (!p || p.error || (!p.username && p.followersCount == null)) {
      return json({ error: `Couldn't find @${handle} — check the handle.` }, 404);
    }

    const followers = p.followersCount ?? p.followers ?? null;
    return json({
      username: p.username || handle,
      fullName: p.fullName || p.full_name || "",
      followers,
      verified: !!(p.verified ?? p.isVerified),
      posts: p.postsCount ?? p.posts ?? null,
      private: !!(p.private ?? p.isPrivate),
      profilePic: p.profilePicUrl || p.profilePicUrlHD || "",
    });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
