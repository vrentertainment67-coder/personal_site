// ============================================================
// DJ VIC — parse-enquiry edge function
// Turns a freeform / dictated enquiry ("wedding sangeet for Rohan 98860…,
// Taj Bangalore, sep 22-23, budget ~1.5L") into structured booking fields,
// using Claude. The admin reviews the pre-filled form before saving.
//
// Deploy:  supabase functions deploy parse-enquiry --no-verify-jwt
// Secrets:
//   ANTHROPIC_API_KEY   (console.anthropic.com → API keys)
//   SUPABASE_URL / SUPABASE_ANON_KEY  (auto)
//
// POST { text, today }  ->  { name, contact, event_type, event_date,
//                            event_end_date, venue, city, budget, message }
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const EVENT_TYPES = ["sangeet", "wedding", "nightlife", "private", "festival", "corporate", "dj class", "training"];
const BUDGETS = ["Under ₹50k", "₹50k – ₹1L", "₹1L – ₹2L", "₹2L+"];

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

const TOOL = {
  name: "log_enquiry",
  description: "Record the structured details of a DJ booking enquiry.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Client/contact person or the venue/company name. Best guess; empty if truly none." },
      contact: { type: "string", description: "Phone number or email if present, else empty." },
      event_type: { type: "string", enum: EVENT_TYPES, description: "Closest matching type. Weddings → 'wedding'; sangeet/reception → 'sangeet'; club/lounge → 'nightlife'; birthday/anniversary/brand party → 'private'; company offsite/conference → 'corporate'; a DJ class → 'dj class'; a training → 'training'; main-stage → 'festival'." },
      event_date: { type: "string", description: "Start date as YYYY-MM-DD. Resolve relative dates ('next Saturday', '22nd') to the NEXT future occurrence relative to today. Empty if no date." },
      event_end_date: { type: "string", description: "End date YYYY-MM-DD for multi-day events (e.g. 'Sep 22-23'). Empty if single-day." },
      venue: { type: "string", description: "Venue / hotel / location name, else empty." },
      city: { type: "string", description: "City, else empty." },
      budget: { type: "string", enum: ["", ...BUDGETS], description: "Closest budget bracket if an amount is mentioned, else empty." },
    },
    required: ["name", "event_type"],
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!(await requireVic(req))) return json({ error: "Not authorized" }, 401);
    if (!ANTHROPIC_KEY) return json({ error: "AI capture isn't configured yet — add the ANTHROPIC_API_KEY secret. You can still fill the form manually." }, 503);

    const body = await req.json().catch(() => ({}));
    const text = (body?.text || "").toString().trim();
    const today = (body?.today || "").toString().slice(0, 10);
    if (!text) return json({ error: "Nothing to read." }, 400);

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        tools: [TOOL],
        tool_choice: { type: "tool", name: "log_enquiry" },
        messages: [{
          role: "user",
          content: `Today's date is ${today || "unknown"} (use it to resolve relative dates to the next future occurrence). Extract the booking enquiry details from this message and call log_enquiry. Leave a field empty rather than guessing wildly.\n\nMessage:\n"""${text}"""`,
        }],
      }),
    });

    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      return json({ error: `AI error (HTTP ${r.status}).`, detail: detail.slice(0, 300) }, 502);
    }
    const data = await r.json();
    const tool = (data.content || []).find((c: any) => c.type === "tool_use");
    if (!tool?.input) return json({ error: "Couldn't read that — try rephrasing with the key details." }, 422);

    const f = tool.input;
    return json({
      name: f.name || "",
      contact: f.contact || "",
      event_type: EVENT_TYPES.includes(f.event_type) ? f.event_type : "private",
      event_date: /^\d{4}-\d{2}-\d{2}$/.test(f.event_date || "") ? f.event_date : "",
      event_end_date: /^\d{4}-\d{2}-\d{2}$/.test(f.event_end_date || "") ? f.event_end_date : "",
      venue: f.venue || "",
      city: f.city || "",
      budget: BUDGETS.includes(f.budget) ? f.budget : "",
      message: text,
    });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
