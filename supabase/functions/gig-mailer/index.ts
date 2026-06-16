// ============================================================
// DJ VIC — gig-mailer edge function
// One-click gig emails: booking confirmation, invoice, follow-up.
// The admin (browser) builds the HTML + the invoice PDF and posts it here;
// this function just authorises, relays to Resend, and logs the send.
//
// Deploy:  supabase functions deploy gig-mailer --no-verify-jwt
// Secrets:
//   RESEND_API_KEY              (already set — shared with newsletter-manager)
//   BILLERS_JSON                two biller profiles incl. bank details, e.g.
//     {"vr":{ "name":"VR Entertainment", ... ,"bank":{...}},
//      "vic":{ "name":"VIC", ... ,"upi":"vikasnaik84@okhdfcbank","bank":{...}}}
//     (kept here, NOT in the repo, so account numbers stay private.)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY  (auto)
//
// Actions (all require a logged-in admin):
//   POST action=billers  -> { vr:{...}, vic:{...} }   (for the invoice UI)
//   POST action=send     -> relay one email + log it
//     body: { bookingId?, kind, biller?, invoiceNo?, amount?,
//             to, fromName, replyTo?, subject, html,
//             attachments?: [{ filename, contentBase64 }] }
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
const BILLERS = (() => { try { return JSON.parse(Deno.env.get("BILLERS_JSON") || "{}"); } catch { return {}; } })();
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Always send from the verified domain; the biller name rides as the display name.
const SEND_FROM = "bookings@djvicofficial.com";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!(await requireVic(req))) return json({ error: "Not authorized" }, 401);
    const action = new URL(req.url).searchParams.get("action");

    if (action === "billers") return json(BILLERS);

    if (action === "send") {
      if (!RESEND_KEY) return json({ error: "RESEND_API_KEY not configured" }, 500);
      const b = await req.json();
      if (!b?.to || !b?.subject || !b?.html) return json({ error: "to, subject, html required" }, 400);

      const payload: Record<string, unknown> = {
        from: `${(b.fromName || "DJ VIC").replace(/[<>\n]/g, "")} <${SEND_FROM}>`,
        to: [b.to],
        subject: b.subject,
        html: b.html,
      };
      if (b.replyTo) payload.reply_to = b.replyTo;
      if (Array.isArray(b.attachments) && b.attachments.length) {
        payload.attachments = b.attachments.map((a: { filename: string; contentBase64: string }) => ({
          filename: a.filename, content: a.contentBase64,
        }));
      }

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const out = await res.json().catch(() => ({}));
      const ok = res.ok && !!out?.id;

      // Log the send (best-effort, service role)
      try {
        const admin = createClient(SUPABASE_URL, SERVICE_KEY);
        await admin.from("gig_emails").insert({
          booking_id: b.bookingId ?? null, kind: b.kind ?? "email", biller: b.biller ?? null,
          invoice_no: b.invoiceNo ?? null, amount: b.amount ?? null, to_email: b.to,
          status: ok ? "sent" : "error", detail: ok ? out.id : JSON.stringify(out).slice(0, 300),
        });
      } catch (_) { /* log table optional */ }

      if (!ok) return json({ error: "Resend error", detail: out }, 502);
      return json({ ok: true, id: out.id });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
