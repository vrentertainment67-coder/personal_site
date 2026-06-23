// ============================================================
// DJ VIC — mail-api edge function
// Read-only view of the bookings@djvicofficial.com inbox for the admin
// "Mail" tab. bookings@ forwards into the Google account, so we read it via
// the Gmail API using the SAME refresh token that powers calendar/GA/GSC.
//
// Deploy:  supabase functions deploy mail-api --no-verify-jwt
// Secrets (shared, already set project-wide):
//   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN
//   SUPABASE_URL / SUPABASE_ANON_KEY  (auto)
//   ⚠ The refresh token MUST include scope
//     https://www.googleapis.com/auth/gmail.readonly
//   alongside the existing webmasters.readonly + analytics.readonly + calendar.
//   Until re-minted, Gmail calls 403 and this returns needScope:true.
//
// GET ?action=list[&q=search]   -> [{id,threadId,from,to,subject,date,snippet,unread}]
// GET ?action=thread&id=THREAD  -> {id, messages:[{id,from,to,date,subject,unread,body,html}]}
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const G_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const G_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const G_REFRESH = Deno.env.get("GOOGLE_REFRESH_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// The address whose mail we surface. Match it as a recipient OR sender so both
// inbound enquiries and our own replies show up.
const BOX = "bookings@djvicofficial.com";
const BASE_Q = `(to:${BOX} OR cc:${BOX} OR from:${BOX} OR deliveredto:${BOX})`;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

async function googleToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: G_ID, client_secret: G_SECRET, refresh_token: G_REFRESH, grant_type: "refresh_token" }),
  });
  const d = await res.json();
  if (!d.access_token) throw new Error("Google token error: " + JSON.stringify(d));
  return d.access_token;
}

// Thrown when the refresh token lacks the gmail.readonly scope.
class ScopeError extends Error {}

async function gmail(path: string, token: string): Promise<any> {
  const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (r.status === 403 || r.status === 401) {
    const t = await r.text().catch(() => "");
    if (/insufficient|scope|ACCESS_TOKEN_SCOPE/i.test(t)) throw new ScopeError(t);
    throw new Error(`Gmail HTTP ${r.status}: ${t.slice(0, 200)}`);
  }
  if (!r.ok) throw new Error(`Gmail HTTP ${r.status}`);
  return r.json();
}

const hdr = (headers: any[], name: string) => (headers || []).find((x) => x.name?.toLowerCase() === name.toLowerCase())?.value || "";

function b64url(s: string): string {
  s = (s || "").replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4;
  if (pad) s += "=".repeat(4 - pad);
  try { return new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0))); } catch { return ""; }
}

function extractBody(payload: any): { text: string; html: string } {
  let text = "", html = "";
  const walk = (p: any) => {
    if (!p) return;
    if (p.mimeType === "text/plain" && p.body?.data && !text) text = b64url(p.body.data);
    else if (p.mimeType === "text/html" && p.body?.data && !html) html = b64url(p.body.data);
    (p.parts || []).forEach(walk);
  };
  walk(payload);
  return { text, html };
}
const stripHtml = (h: string) => h.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!(await requireVic(req))) return json({ error: "Not authorized" }, 401);
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "list";
    const token = await googleToken();

    if (action === "list") {
      const extra = (url.searchParams.get("q") || "").trim();
      const q = extra ? `${BASE_Q} (${extra})` : BASE_Q;
      const listed = await gmail(`messages?maxResults=25&q=${encodeURIComponent(q)}`, token);
      const ids: string[] = (listed.messages || []).map((m: any) => m.id);
      const items = await Promise.all(ids.map(async (id) => {
        const m = await gmail(`messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`, token);
        const h = m.payload?.headers || [];
        return { id: m.id, threadId: m.threadId, from: hdr(h, "From"), to: hdr(h, "To"), subject: hdr(h, "Subject"), date: hdr(h, "Date"), snippet: m.snippet || "", unread: (m.labelIds || []).includes("UNREAD") };
      }));
      return json({ items });
    }

    if (action === "thread") {
      const id = url.searchParams.get("id");
      if (!id) return json({ error: "thread id required" }, 400);
      const t = await gmail(`threads/${id}?format=full`, token);
      const messages = (t.messages || []).map((m: any) => {
        const h = m.payload?.headers || [];
        const { text, html } = extractBody(m.payload);
        return { id: m.id, from: hdr(h, "From"), to: hdr(h, "To"), date: hdr(h, "Date"), subject: hdr(h, "Subject"), unread: (m.labelIds || []).includes("UNREAD"), body: text || stripHtml(html), html };
      });
      return json({ id, messages });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    if (e instanceof ScopeError) {
      return json({ error: "Gmail access isn't granted yet. Re-mint the Google refresh token with the gmail.readonly scope added (keep the existing 3 scopes too).", needScope: true }, 403);
    }
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
