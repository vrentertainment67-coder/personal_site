// ============================================================
// DJ VIC — Booking Funnel : Google Calendar sync (Edge Function)
// OAuth refresh-token version (no service-account key needed).
// Deploy:  supabase functions deploy calendar-sync
// Repo path: supabase/functions/calendar-sync/index.ts
//
// ACTIONS
//   action=availability  (GET, public)     -> busy dates from Google
//   action=confirm       (POST, Vic only)  -> create gig + mark accepted
//   action=release       (POST, Vic only)  -> delete gig + mark declined
//
// SECRETS (supabase secrets set KEY=value)
//   GOOGLE_CLIENT_ID            OAuth client id
//   GOOGLE_CLIENT_SECRET        OAuth client secret
//   GOOGLE_REFRESH_TOKEN        one-time refresh token (calendar scope)
//   GIG_CALENDAR_ID             vrentertainment67@gmail.com
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY  (auto)
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TZ = "Asia/Kolkata";
const CAL_ID = Deno.env.get("GIG_CALENDAR_ID")!;
const CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const REFRESH_TOKEN = Deno.env.get("GOOGLE_REFRESH_TOKEN")!;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

// ---------- Google access token via OAuth refresh token ----------
let _token: { value: string; exp: number } | null = null;
async function googleToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (_token && _token.exp > now + 60) return _token.value;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("Google token error: " + JSON.stringify(data));
  _token = { value: data.access_token, exp: now + (data.expires_in ?? 3600) - 100 };
  return _token.value;
}

// ---------- helpers ----------
const istDate = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso)); // YYYY-MM-DD

function eachDate(fromISO: string, toISO: string): string[] {
  const out: string[] = [];
  const d = new Date(istDate(fromISO));
  const end = new Date(istDate(toISO));
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

async function requireVic(req: Request): Promise<boolean> {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  const supa = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data, error } = await supa.auth.getUser();
  return !error && !!data.user; // single-owner project: any signed-in user is Vic
}

// ---------- actions ----------
async function availability(from: string, to: string) {
  const token = await googleToken();
  const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      timeMin: new Date(from + "T00:00:00+05:30").toISOString(),
      timeMax: new Date(to + "T23:59:59+05:30").toISOString(),
      timeZone: TZ,
      items: [{ id: CAL_ID }],
    }),
  });
  const data = await res.json();
  const busyIntervals = data?.calendars?.[CAL_ID]?.busy ?? [];
  const busyDates = new Set<string>();
  for (const b of busyIntervals) {
    for (const d of eachDate(b.start, b.end)) busyDates.add(d);
  }
  return json({ busy: [...busyDates] });
}

async function confirm(bookingId: string) {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: bk, error } = await admin
    .from("bookings").select("*").eq("id", bookingId).single();
  if (error || !bk) return json({ error: "Booking not found." }, 404);
  if (bk.status === "accepted" && bk.gcal_event_id)
    return json({ ok: true, alreadyConfirmed: true });

  const token = await googleToken();
  const next = new Date(bk.event_date);
  next.setUTCDate(next.getUTCDate() + 1);
  const endDate = next.toISOString().slice(0, 10);

  const ev = {
    summary: `GIG · ${bk.name} (${bk.event_type})`,
    description:
      `Booking via funnel\n` +
      `Client: ${bk.name}\nContact: ${bk.contact}\n` +
      `Type: ${bk.event_type}\nBudget: ${bk.budget ?? "—"}\n\n${bk.message ?? ""}`,
    location: [bk.venue, bk.city].filter(Boolean).join(", "),
    start: { date: bk.event_date, timeZone: TZ },
    end: { date: endDate, timeZone: TZ },
    colorId: "6", // tangerine
  };

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CAL_ID)}/events`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(ev),
    },
  );
  const created = await res.json();
  if (!created.id) return json({ error: "Calendar write failed", detail: created }, 502);

  await admin.from("bookings")
    .update({ status: "accepted", gcal_event_id: created.id })
    .eq("id", bookingId);

  return json({ ok: true, eventId: created.id });
}

async function release(bookingId: string) {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: bk } = await admin
    .from("bookings").select("*").eq("id", bookingId).single();
  if (bk?.gcal_event_id) {
    const token = await googleToken();
    await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CAL_ID)}/events/${bk.gcal_event_id}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
    );
  }
  await admin.from("bookings")
    .update({ status: "declined", gcal_event_id: null })
    .eq("id", bookingId);
  return json({ ok: true });
}

// ---------- router ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    if (action === "availability") {
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      if (!from || !to) return json({ error: "from and to required" }, 400);
      return await availability(from, to);
    }

    if (action === "confirm" || action === "release") {
      if (!(await requireVic(req))) return json({ error: "Not authorized" }, 401);
      const { bookingId } = await req.json();
      if (!bookingId) return json({ error: "bookingId required" }, 400);
      return action === "confirm" ? await confirm(bookingId) : await release(bookingId);
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
