import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, ComposedChart, Line } from "recharts";
import {
  LayoutDashboard, CalendarDays, Image as ImageIcon, Images, Quote, TrendingUp, ClipboardList,
  CheckCircle2, XCircle, Clock, MapPin, Plus, Trash2, LogOut, Loader2, Upload,
  MessageCircle, Star, Ban, Mail, Send, Users, History, Eye, EyeOff, Mic, Activity, Download, Zap,
  AtSign, RefreshCw, Film, Pencil, Inbox, Sparkles,
} from "lucide-react";
import { IMAGE_SLOTS } from "../lib/imageSlots.js";

// ============================================================
// DJ VIC — Admin (production)
// Tabs: Overview · Bookings · Calendar · Media · Testimonials · Marketing
// Env: PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY (Astro)
// ============================================================
const SUPABASE_URL = import.meta.env?.PUBLIC_SUPABASE_URL || "https://YOUR-PROJECT.supabase.co";
const SUPABASE_ANON_KEY = import.meta.env?.PUBLIC_SUPABASE_ANON_KEY || "YOUR_ANON_KEY";
const FN = `${SUPABASE_URL}/functions/v1`;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const EVENT_TYPES = ["sangeet", "wedding", "nightlife", "private", "festival", "corporate", "dj class", "training", "other"];
const BUDGETS = ["Under ₹50k", "₹50k – ₹1L", "₹1L – ₹2L", "₹2L+"];
const pad = (n) => String(n).padStart(2, "0");
const ymd = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const waDigits = (s) => (s || "").replace(/[^0-9]/g, "");

// ── Guest Pipeline helpers ──
const STATUSES = [["lead", "Lead"], ["contacted", "Contacted"], ["confirmed", "Confirmed"]];
const STATUS_COLOR = { lead: "#9a9a8a", contacted: "#e0b13c", confirmed: "#4ea765" };
const INDUSTRIES = ["Music / DJ", "Nightlife", "Hospitality", "Bartending", "Comedy", "Radio / Voice", "Film / TV", "Fashion", "Fitness", "Business / Founder", "Sports", "Content Creator", "Art", "Food", "Other"];
const fmtFollowers = (n) => (n == null || n === "" ? "—" : Number(n) >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "M" : Number(n) >= 1e3 ? (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + "K" : String(n));
const fmtDate = (s) => { if (!s) return ""; const d = new Date(s + "T00:00:00"); return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`; };
const ymdLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isSunday = (s) => !!s && new Date(s + "T00:00:00").getDay() === 0;
// The next `count` Sundays (release slots), starting with this week's, as YYYY-MM-DD.
function upcomingSundays(count = 12) {
  const out = []; const d = new Date(); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7)); // jump to the coming Sunday (today if it is one)
  for (let i = 0; i < count; i++) { out.push(ymdLocal(d)); d.setDate(d.getDate() + 7); }
  return out;
}
function popTier(n) { if (n == null || n === "") return null; n = Number(n); if (n >= 1e6) return { label: "Mega", stars: 5 }; if (n >= 5e5) return { label: "Macro", stars: 4 }; if (n >= 1e5) return { label: "Mid", stars: 3 }; if (n >= 1e4) return { label: "Micro", stars: 2 }; return { label: "Nano", stars: 1 }; }
async function fetchIgStats(handle) {
  const r = await fetch(`${FN}/instagram-stats`, { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) }, body: JSON.stringify({ handle }) });
  return r.json().catch(() => ({ error: "Couldn't reach the Instagram service." }));
}
async function mailApi(params) {
  const qs = new URLSearchParams(params).toString();
  const r = await fetch(`${FN}/mail-api?${qs}`, { headers: { ...(await authHeader()) } });
  return r.json().catch(() => ({ error: "Couldn't reach mail." }));
}
async function parseEnquiry(text) {
  const r = await fetch(`${FN}/parse-enquiry`, { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) }, body: JSON.stringify({ text, today: ymdLocal(new Date()) }) });
  return r.json().catch(() => ({ error: "Couldn't reach the parser." }));
}
const mailName = (from) => { const m = (from || "").match(/^\s*"?([^"<]*?)"?\s*<.*>/); return (m && m[1].trim()) || (from || "").replace(/<.*>/, "").trim() || from; };
// Booking status → [label, colour]. "pending" reads as "Enquiry" for the owner.
const BK_STATUS = { pending: ["Enquiry", "#e0b13c"], accepted: ["Confirmed", "#4ea765"], completed: ["Completed · Paid", "#5a8f8a"], declined: ["Declined", "#9a9a8a"] };
// Render a single date or a multi-day range, e.g. "Sep 22–23" or "Sep 30 – Oct 1".
function fmtRange(s, e) {
  if (!s) return "—";
  const sd = new Date(s + "T00:00:00");
  const sm = `${MONTHS[sd.getMonth()]} ${sd.getDate()}`;
  if (!e || e === s) return sm;
  const ed = new Date(e + "T00:00:00");
  if (sd.getMonth() === ed.getMonth() && sd.getFullYear() === ed.getFullYear()) return `${MONTHS[sd.getMonth()]} ${sd.getDate()}–${ed.getDate()}`;
  return `${sm} – ${MONTHS[ed.getMonth()]} ${ed.getDate()}`;
}
const mailDate = (s) => { const d = new Date(s); if (isNaN(d)) return s; const now = new Date(); const sameDay = d.toDateString() === now.toDateString(); return sameDay ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : `${MONTHS[d.getMonth()]} ${d.getDate()}`; };
const isVideo = (url) => /\/video\/upload\//.test(url || "") || /\.(mp4|webm|mov|m4v)$/i.test(url || "");

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token}` };
}

// Upload a file to Cloudinary using the signed payload from admin-api.
// Small files (images, short clips) go in a single request — the original,
// working path. Larger files (videos) are sent in 20MB chunks via Cloudinary's
// chunked-upload protocol, otherwise one giant POST fails with "Failed to fetch".
async function cloudinaryUpload(file, sign) {
  const CHUNK = 20 * 1024 * 1024; // 20MB (a multiple of 5MB, as Cloudinary requires)
  const appendSigned = (fd) => {
    fd.append("api_key", sign.apiKey);
    fd.append("timestamp", sign.timestamp);
    fd.append("signature", sign.signature);
    fd.append("folder", sign.folder);
  };

  // Single request for anything that comfortably fits.
  if (file.size <= CHUNK) {
    const fd = new FormData();
    fd.append("file", file);
    appendSigned(fd);
    const r = await fetch(sign.uploadUrl, { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    if (!j.secure_url) throw new Error(j.error?.message || `Upload failed (HTTP ${r.status})`);
    return j;
  }

  // Chunked upload for large videos.
  const uploadId = `vic_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const total = file.size;
  let start = 0, last = null;
  while (start < total) {
    const end = Math.min(start + CHUNK, total);
    const fd = new FormData();
    fd.append("file", file.slice(start, end));
    appendSigned(fd);
    const r = await fetch(sign.uploadUrl, {
      method: "POST",
      headers: { "X-Unique-Upload-Id": uploadId, "Content-Range": `bytes ${start}-${end - 1}/${total}` },
      body: fd,
    });
    const j = await r.json().catch(() => ({}));
    if (j.error) throw new Error(j.error.message || `Upload failed (HTTP ${r.status})`);
    last = j;
    start = end;
  }
  if (!last?.secure_url) throw new Error("Upload completed but no URL was returned.");
  return last;
}

export default function Admin() {
  const [session, setSession] = useState(null);
  const [tab, setTab] = useState("overview");
  const [toast, setToast] = useState(null);
  const showToast = (m) => { setToast(m); setTimeout(() => setToast(null), 3200); };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Flag this browser so the visitor tracker never counts Vic's own visits.
  useEffect(() => { if (session) { try { localStorage.setItem("vic_notrack", "1"); } catch (e) {} } }, [session]);

  if (!session) return <><Styles /><Login showToast={showToast} /></>;

  const TABS = [
    ["overview", "Overview", LayoutDashboard],
    ["today", "Today", Zap],
    ["bookings", "Bookings", ClipboardList],
    ["events", "Events", Star],
    ["guests", "Guests", Users],
    ["podcast", "Podcast", Mic],
    ["collective", "Collective", Activity],
    ["mail", "Mail", Inbox],
    ["calendar", "Calendar", CalendarDays],
    ["media", "Media", ImageIcon],
    ["pageimages", "Page Images", Images],
    ["testimonials", "Reviews", Quote],
    ["marketing", "Marketing", TrendingUp],
    ["newsletter", "Newsletter", Mail],
  ];

  return (
    <div className="adm">
      <Styles />
      <header className="adm-top">
        <div className="brand"><span className="bm">VIC</span><span className="bs">ADMIN</span></div>
        <button className="logout" onClick={() => supabase.auth.signOut()}><LogOut size={14} /> Sign out</button>
      </header>
      <nav className="adm-nav">
        {TABS.map(([k, label, Icon]) => (
          <button key={k} className={tab === k ? "navb on" : "navb"} onClick={() => setTab(k)}>
            <Icon size={16} /> {label}
          </button>
        ))}
      </nav>
      <main className="adm-main">
        {tab === "overview" && <Overview />}
        {tab === "today" && <Today showToast={showToast} />}
        {tab === "bookings" && <Bookings showToast={showToast} />}
        {tab === "events" && <EventsAdmin showToast={showToast} />}
        {tab === "guests" && <Guests showToast={showToast} />}
        {tab === "podcast" && <Podcast showToast={showToast} />}
        {tab === "collective" && <DJCollective showToast={showToast} />}
        {tab === "mail" && <MailTab showToast={showToast} />}
        {tab === "calendar" && <CalendarTab showToast={showToast} />}
        {tab === "media" && <Media showToast={showToast} />}
        {tab === "pageimages" && <PageImages showToast={showToast} />}
        {tab === "testimonials" && <Testimonials showToast={showToast} />}
        {tab === "marketing" && <Marketing showToast={showToast} />}
        {tab === "newsletter" && <Newsletter showToast={showToast} />}
      </main>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function Login({ showToast }) {
  const [email, setEmail] = useState(""); const [pwd, setPwd] = useState(""); const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pwd });
    setBusy(false); if (error) showToast(error.message);
  };
  return (
    <div className="adm login-wrap">
      <div className="card login">
        <div className="brand center"><span className="bm">VIC</span><span className="bs">ADMIN</span></div>
        <div className="field"><label>Email</label><input value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="field"><label>Password</label><input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} /></div>
        <button className="btn" onClick={go} disabled={busy}>{busy ? <Loader2 className="spin" size={16} /> : "Sign in"}</button>
      </div>
    </div>
  );
}

// ---------------- OVERVIEW ----------------
const BUDGET_MID = { [BUDGETS[0]]: 35000, [BUDGETS[1]]: 75000, [BUDGETS[2]]: 150000, [BUDGETS[3]]: 250000 };
const PIE = ["#C9A84C", "#E2C475", "#8a7a3c", "#9a9a92", "#5a5a54", "#b8923e", "#3a3a3a"];
const cap = (s) => (s || "—").charAt(0).toUpperCase() + (s || "—").slice(1);
const fmtINR = (n) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(1)}Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(1)}L` : n >= 1000 ? `₹${Math.round(n / 1000)}k` : `₹${n}`);
const tipStyle = { background: "#111", border: "1px solid rgba(232,232,224,0.12)", borderRadius: 8, color: "#E8E8E0" };

const Donut = ({ data }) => (!data.length ? <p className="empty" style={{ padding: 16 }}>No data yet.</p> : (
  <div style={{ height: 180 }}>
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={2} stroke="none">
          {data.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
        </Pie>
        <Tooltip contentStyle={tipStyle} />
      </PieChart>
    </ResponsiveContainer>
  </div>
));

const RankList = ({ rows }) => {
  if (!rows.length) return <p className="empty" style={{ padding: 16 }}>No data yet.</p>;
  const top = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="ranklist">
      {rows.map((r, i) => (
        <div className="rankrow" key={i}>
          <span className="rl-label">{r.label}</span>
          <span className="rl-bar"><span style={{ width: `${Math.round((r.value / top) * 100)}%` }} /></span>
          <span className="rl-val">{r.value}</span>
        </div>
      ))}
    </div>
  );
};

// ── Insights tab: conversions (our events_log) + GA4 traffic ──
function Ranked({ rows, empty }) {
  if (!rows || !rows.length) return <p className="empty" style={{ padding: 12 }}>{empty || "No data yet."}</p>;
  const max = rows.reduce((m, r) => Math.max(m, r.value), 0) || 1;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "4px 0" }}>
      {rows.map((r) => (
        <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: ".82rem" }}>
          <span style={{ flex: "0 0 40%", color: "rgba(255,255,255,.75)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.key}>{r.key}</span>
          <span style={{ flex: 1, height: 8, background: "#1a1a1a", borderRadius: 4, overflow: "hidden" }}>
            <span style={{ display: "block", height: "100%", width: `${Math.round((r.value / max) * 100)}%`, background: "#c9a84c" }} />
          </span>
          <strong style={{ flex: "0 0 auto", color: "#c9a84c", minWidth: 30, textAlign: "right" }}>{r.value}</strong>
        </div>
      ))}
    </div>
  );
}
function fmtDur(s) { s = Number(s) || 0; return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`; }

// Combined Marketing tab: one home for traffic (GA4 + our conversion log) and
// Google search (GSC). The wrapper owns all fetching so the headline can show
// the funnel across both sources; the two sub-views are presentational.
function Marketing({ showToast }) {
  const [sub, setSub] = useState("traffic");
  const [log, setLog] = useState(null);
  const [logLoading, setLogLoading] = useState(true);
  const [ga, setGa] = useState(null);
  const [gaLoading, setGaLoading] = useState(true);
  const [seo, setSeo] = useState(null);
  const [seoLoading, setSeoLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // Conversions — our own events_log (last 30 days)
    (async () => {
      const from = new Date(); from.setDate(from.getDate() - 30);
      const { data, error } = await supabase.from("events_log")
        .select("name,location,event_type,device,created_at")
        .gte("created_at", from.toISOString())
        .order("created_at", { ascending: false });
      if (error) showToast?.("Couldn't load conversions — is events_log.sql run?");
      if (!cancelled) { setLog(data || []); setLogLoading(false); }
    })();
    // GA4 traffic
    (async () => {
      let r;
      try {
        r = await fetch(`${FN}/admin-api?action=ga-stats`, {
          method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) },
        }).then((res) => res.json());
      } catch { r = { connected: false, reason: "request failed" }; }
      if (!cancelled) { setGa(r); setGaLoading(false); }
    })();
    // Search Console — with a hard timeout so it can never spin forever
    (async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15000);
      let res;
      try {
        const r = await fetch(`${FN}/admin-api?action=seo-stats`, { method: "POST", headers: await authHeader(), signal: ctrl.signal });
        res = await r.json();
      } catch {
        res = { connected: false, reason: ctrl.signal.aborted ? "Timed out — Search Console didn't respond" : "Network error" };
      }
      clearTimeout(timer);
      if (!cancelled) { setSeo(res); setSeoLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [showToast]);

  // Shared one-line funnel headline: visitors → from Google search → search clicks
  const visitors = ga?.connected ? ga.totals?.users : null;
  const orgSearch = ga?.connected ? ((ga.channels || []).find((x) => /organic search/i.test(x.key))?.value ?? null) : null;
  const searchClicks = seo?.connected ? seo.totals?.clicks : null;
  const bits = [];
  if (visitors != null) bits.push(`${visitors} visitors`);
  if (orgSearch != null) bits.push(`${orgSearch} from Google search`);
  if (searchClicks != null) bits.push(`${searchClicks} search clicks`);
  const headline = bits.length ? `${bits.join(" · ")} · last 28 days` : "Traffic & Google search · last 28 days";

  const SUBS = [["traffic", "Traffic", Activity], ["search", "Search (Google)", TrendingUp]];

  return (
    <>
      <h1 className="h1">Marketing</h1>
      <p className="sub" style={{ marginTop: 2 }}>{headline}</p>
      <div className="nl-tabs">
        {SUBS.map(([k, label, Icon]) => (
          <button key={k} className={sub === k ? "nl-tab on" : "nl-tab"} onClick={() => setSub(k)}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>
      {sub === "traffic" && <MarketingTraffic log={log} loading={logLoading} ga={ga} gaLoading={gaLoading} />}
      {sub === "search" && <MarketingSearch data={seo} loading={seoLoading} />}
    </>
  );
}

function MarketingTraffic({ log, loading, ga, gaLoading }) {
  const c = useMemo(() => {
    const rows = log || [];
    const count = (n) => rows.filter((r) => r.name === n).length;
    const group = (filterName, field) => {
      const m = {};
      rows.filter((r) => !filterName || r.name === filterName).forEach((r) => { const k = r[field] || "(none)"; m[k] = (m[k] || 0) + 1; });
      return Object.entries(m).map(([key, value]) => ({ key, value })).sort((a, b) => b.value - a.value);
    };
    return {
      leads: count("generate_lead"), wa: count("whatsapp_click"), email: count("email_click"), tel: count("tel_click"),
      waByLoc: group("whatsapp_click", "location"),
      leadsByType: group("generate_lead", "event_type"),
      devices: group(null, "device"),
    };
  }, [log]);

  return (
    <>
      <p className="sub" style={{ color: "#c9a84c", margin: "2px 0 8px" }}>Conversions · last 30 days (your own log — real-time, not affected by ad-blockers)</p>
      {loading ? <Center><Loader2 className="spin" size={18} /></Center> : (
        <>
          <div className="cards">
            <Stat label="Leads" value={c.leads} />
            <Stat label="WhatsApp clicks" value={c.wa} />
            <Stat label="Email clicks" value={c.email} />
            <Stat label="Call clicks" value={c.tel} />
          </div>
          <div className="grid2">
            <div className="card"><h3 className="card-h">Top WhatsApp placements</h3><Ranked rows={c.waByLoc} empty="No WhatsApp clicks yet." /></div>
            <div className="card"><h3 className="card-h">Leads by source</h3><Ranked rows={c.leadsByType} empty="No leads yet." /></div>
          </div>
          <div className="card"><h3 className="card-h">Device split (all events)</h3><Ranked rows={c.devices} empty="No data yet." /></div>
        </>
      )}

      <p className="sub" style={{ color: "#c9a84c", margin: "22px 0 8px" }}>Traffic · GA4 · last 28 days</p>
      {gaLoading ? <Center><Loader2 className="spin" size={18} /></Center> :
        (ga && ga.connected) ? (
          <>
            <div className="cards">
              <Stat label="Users" value={ga.totals.users} />
              <Stat label="Sessions" value={ga.totals.sessions} />
              <Stat label="Pageviews" value={ga.totals.views} />
              <Stat label="Avg session" value={fmtDur(ga.totals.avgDuration)} />
            </div>
            <div className="grid2">
              <div className="card"><h3 className="card-h">Channels</h3><Ranked rows={ga.channels} empty="—" /></div>
              <div className="card"><h3 className="card-h">Top pages</h3><Ranked rows={ga.pages} empty="—" /></div>
            </div>
            <div className="grid2">
              <div className="card"><h3 className="card-h">Cities</h3><Ranked rows={ga.cities} empty="—" /></div>
              <div className="card"><h3 className="card-h">Devices</h3><Ranked rows={ga.devices} empty="—" /></div>
            </div>
          </>
        ) : (
          <div className="card">
            <p className="empty" style={{ padding: 12 }}>
              GA4 not connected{ga && ga.reason ? ` — ${String(ga.reason).slice(0, 120)}` : ""}. Add the <code>analytics.readonly</code> scope
              to the Google connection, enable the Analytics Data API, and redeploy <code>admin-api</code>.
            </p>
          </div>
        )}
    </>
  );
}

// ── "Today" — the action feed: CRM segments as a plain-English to-do list ──
function Today({ showToast }) {
  const [segs, setSegs] = useState(null);
  useEffect(() => {
    (async () => {
      const [unpaid, stale, rebook, loyal, invite] = await Promise.all([
        supabase.from("seg_unpaid_soon").select("*"),
        supabase.rpc("seg_stale_leads", { days: 7 }),
        supabase.from("seg_past_clients").select("*"),
        supabase.from("seg_repeat_guests").select("*"),
        supabase.from("seg_invite_candidates").select("*"),
      ]);
      const firstErr = [unpaid, stale, rebook, loyal, invite].map((r) => r.error).find(Boolean);
      if (firstErr) showToast?.("CRM segments not reachable — is crm_unify.sql run?");
      setSegs({ unpaid: unpaid.data || [], stale: stale.data || [], rebook: rebook.data || [], loyal: loyal.data || [], invite: invite.data || [] });
    })();
  }, [showToast]);

  if (!segs) return <Center><Loader2 className="spin" size={20} /> &nbsp;Reading your contacts…</Center>;

  const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
  const nm = (c) => c.name || (c.email ? c.email.split("@")[0] : "there");
  const groups = [
    { key: "unpaid", title: "Money to collect", color: "#ff8a8a", rows: segs.unpaid, action: "Chase payment",
      msg: (c) => `Hi ${nm(c)}, hope the event went brilliantly! Just a gentle reminder about the pending balance of ${inr(c.balance)} — happy to share UPI / bank details whenever convenient. Thank you!` },
    { key: "stale", title: "Leads waiting on you", color: "#c9a84c", rows: segs.stale, action: "Follow up",
      msg: (c) => `Hi ${nm(c)}, following up on your enquiry with DJ VIC — still keen to make your event special. Shall we lock in the details?` },
    { key: "rebook", title: "Past clients — win them back", color: "#7fe0a0", rows: segs.rebook, action: "Reach out",
      msg: (c) => `Hi ${nm(c)}, it was a pleasure playing your event! I'd love to be part of your next one — anything coming up?` },
    { key: "loyal", title: "Loyal guests — invite to book", color: "#9bb8ff", rows: segs.loyal, action: "Invite",
      msg: (c) => `Hi ${nm(c)}, loved having you on the dancefloor! If you're ever planning an event, I'd love to play it for you.` },
    { key: "invite", title: "Grow the newsletter (ask first)", color: "#cda8ff", rows: segs.invite, action: "Ask to subscribe",
      msg: (c) => `Hi ${nm(c)}, I send out an occasional newsletter with new mixes & upcoming dates — want me to add you? Totally optional!` },
  ];
  const total = groups.reduce((s, g) => s + g.rows.length, 0);
  const outstanding = segs.unpaid.reduce((s, c) => s + Number(c.balance || 0), 0);

  return (
    <>
      <h1 className="h1">Today</h1>
      <p className="sub">{total ? `${total} thing${total !== 1 ? "s" : ""} worth doing — in plain English.` : "All clear — nothing needs chasing right now. 🎉"}</p>
      {outstanding > 0 && <p className="sub" style={{ color: "#ff8a8a", marginTop: -6 }}><strong>{inr(outstanding)}</strong> outstanding to collect.</p>}

      {groups.map((g) => (
        <div key={g.key} style={{ marginTop: 18 }}>
          <h3 className="card-h" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: g.color, display: "inline-block" }} />
            {g.title} <span style={{ color: "rgba(255,255,255,.4)", fontWeight: 400 }}>· {g.rows.length}</span>
          </h3>
          {g.rows.length === 0 ? <p className="empty" style={{ padding: "4px 0" }}>Nothing here.</p> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {g.rows.map((c) => {
                const wa = (c.phone || "").replace(/\D/g, "");
                return (
                  <div key={c.id} className="card" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                      <div><strong>{c.name || c.email || c.phone || "Unknown"}</strong></div>
                      <div style={{ color: g.color, fontWeight: 700, fontSize: ".82rem" }}>{c.display_label}</div>
                      <div style={{ color: "rgba(255,255,255,.6)", fontSize: ".8rem" }}>{c.display_line}{c.balance ? ` · ${inr(c.balance)} due` : ""}</div>
                    </div>
                    {wa.length >= 10
                      ? <a className="act wa" href={`https://wa.me/${wa}?text=${encodeURIComponent(g.msg(c))}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}><MessageCircle size={15} /> {g.action}</a>
                      : <span style={{ fontSize: ".72rem", color: "rgba(255,255,255,.4)" }}>No phone{c.email ? ` · ${c.email}` : ""}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </>
  );
}

function Overview() {
  const [vis, setVis] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [traffic, setTraffic] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const to = new Date(); const from = new Date(); from.setDate(to.getDate() - 29);
      const f = (dt) => ymd(dt.getFullYear(), dt.getMonth(), dt.getDate());
      const [v, b, t] = await Promise.all([
        supabase.rpc("visitor_stats", { p_from: f(from), p_to: f(to) }),
        supabase.from("bookings").select("*").order("created_at", { ascending: false }),
        supabase.rpc("overview_traffic", { p_from: f(from), p_to: f(to) }).then((r) => r.data).catch(() => null),
      ]);
      setVis((v.data || []).map((r) => ({ ...r, label: `${MONTHS[new Date(r.d).getMonth()]} ${new Date(r.d).getDate()}` })));
      setBookings(b.data || []);
      setTraffic(t || null);
      setLoading(false);
    })();
  }, []);

  const d = useMemo(() => {
    const now = Date.now(); const DAY = 864e5; const WEEK = 7 * DAY;
    const todayStr = new Date().toISOString().slice(0, 10);
    const views30 = vis.reduce((s, r) => s + (r.views || 0), 0);
    const todayViews = vis.length ? vis[vis.length - 1].views : 0;
    // Funnel/lead metrics count ORGANIC (website) requests only — manually
    // logged gigs are existing contacts/references, not funnel leads.
    const organic = bookings.filter((b) => (b.source || "website") !== "manual");
    const newWeek = organic.filter((b) => now - new Date(b.created_at).getTime() < WEEK).length;
    const leads30 = organic.filter((b) => now - new Date(b.created_at).getTime() < 30 * DAY).length;
    const pending = bookings.filter((b) => b.status === "pending").length;
    const acceptedOrganic = organic.filter((b) => b.status === "accepted").length;
    const conv = organic.length ? Math.round((acceptedOrganic / organic.length) * 100) : 0;
    const pipeline = bookings.filter((b) => b.status === "pending" || b.status === "accepted")
      .reduce((s, b) => s + (BUDGET_MID[b.budget] || 0), 0);

    const upcoming = bookings.filter((b) => b.status === "accepted" && b.event_date >= todayStr)
      .sort((a, b) => a.event_date.localeCompare(b.event_date));
    const next = upcoming[0];
    const nextDays = next ? Math.max(0, Math.ceil((new Date(next.event_date).getTime() - now) / DAY)) : null;
    const next90 = upcoming.filter((b) => new Date(b.event_date).getTime() - now < 90 * DAY).length;

    const byKey = (key, lim) => {
      const m = {}; bookings.forEach((b) => { const k = cap(b[key]); m[k] = (m[k] || 0) + 1; });
      const arr = Object.entries(m).map(([k, v]) => ({ name: k, label: k, value: v })).sort((a, b) => b.value - a.value);
      return lim ? arr.slice(0, lim) : arr;
    };

    const weeks = [];
    for (let i = 7; i >= 0; i--) {
      const start = now - (i + 1) * WEEK, end = now - i * WEEK;
      const c = organic.filter((b) => { const x = new Date(b.created_at).getTime(); return x >= start && x < end; }).length;
      const dt = new Date(end - DAY);
      weeks.push({ label: `${MONTHS[dt.getMonth()]} ${dt.getDate()}`, leads: c });
    }

    const sources = traffic ? (traffic.top_sources || []).map((s) => ({ name: s.source, label: s.source, value: s.views })) : [];
    const pages = traffic ? (traffic.top_pages || []).map((p) => ({ label: p.path, value: p.views })) : [];
    const bookViews = traffic ? (traffic.book_views || 0) : 0;
    const funnel = bookViews ? Math.round((leads30 / bookViews) * 100) : null;

    return { views30, todayViews, newWeek, leads30, pending, conv, pipeline, next, nextDays, next90,
      types: byKey("event_type"), cities: byKey("city", 6), weeks, sources, pages, bookViews, funnel, hasTraffic: !!traffic };
  }, [vis, bookings, traffic]);

  if (loading) return <Center><Loader2 className="spin" size={20} /> Loading…</Center>;

  const trafficPlaceholder = <p className="empty" style={{ padding: 16 }}>Run <code>overview_traffic.sql</code> to enable.</p>;

  return (
    <>
      <h1 className="h1">Overview</h1>
      <div className="cards">
        <Stat label="Visitors today" value={d.todayViews} />
        <Stat label="Visitors · 30d" value={d.views30} />
        <Stat label="New leads · 7d" value={d.newWeek} />
        <Stat label="Conversion" value={`${d.conv}%`} />
        <Stat label="Pipeline (est)" value={fmtINR(d.pipeline)} />
        <Stat label="Pending" value={d.pending} />
      </div>

      <div className="card">
        <h3 className="card-h">Next gig</h3>
        {d.next ? (
          <p className="sub" style={{ margin: 0 }}>
            <strong style={{ color: "#C9A84C" }}>{d.next.name}</strong> · {cap(d.next.event_type)} · {new Date(d.next.event_date).toDateString()} — <strong>{d.nextDays} day{d.nextDays === 1 ? "" : "s"} away</strong> · {d.next90} confirmed in the next 90 days
          </p>
        ) : <p className="empty" style={{ padding: 16 }}>No upcoming confirmed gigs.</p>}
      </div>

      <div className="grid2">
        <div className="card">
          <h3 className="card-h">Visitors · last 14 days</h3>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={vis.slice(-14)}>
                <CartesianGrid stroke="rgba(232,232,224,0.06)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#9a9a92", fontSize: 11 }} axisLine={false} tickLine={false} interval={1} />
                <Tooltip contentStyle={tipStyle} cursor={{ fill: "rgba(201,168,76,0.08)" }} />
                <Bar dataKey="views" name="Views" fill="#C9A84C" radius={[4, 4, 0, 0]} />
                <Bar dataKey="uniques" name="Uniques" fill="#5a5a54" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <h3 className="card-h">Leads · last 8 weeks</h3>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.weeks}>
                <CartesianGrid stroke="rgba(232,232,224,0.06)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#9a9a92", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tipStyle} cursor={{ fill: "rgba(201,168,76,0.08)" }} />
                <Bar dataKey="leads" name="Leads" fill="#C9A84C" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid2">
        <div className="card"><h3 className="card-h">Event types</h3><Donut data={d.types} /></div>
        <div className="card"><h3 className="card-h">Top cities</h3><RankList rows={d.cities} /></div>
      </div>

      <div className="grid2">
        <div className="card"><h3 className="card-h">Traffic sources · 30d</h3>{d.hasTraffic ? <Donut data={d.sources} /> : trafficPlaceholder}</div>
        <div className="card"><h3 className="card-h">Top pages · 30d</h3>{d.hasTraffic ? <RankList rows={d.pages} /> : trafficPlaceholder}</div>
      </div>

      <div className="card">
        <h3 className="card-h">Booking funnel · 30 days</h3>
        {d.funnel !== null ? (
          <p className="sub" style={{ margin: 0 }}>
            <strong>{d.bookViews}</strong> visits to /book → <strong>{d.leads30}</strong> requests = <strong style={{ color: "#C9A84C" }}>{d.funnel}%</strong> convert
          </p>
        ) : (d.hasTraffic ? <p className="empty" style={{ padding: 16 }}>No /book visits in this window yet.</p> : trafficPlaceholder)}
      </div>
    </>
  );
}

// ---------------- BOOKINGS ----------------
function Bookings({ showToast }) {
  const [rows, setRows] = useState([]); const [pays, setPays] = useState({}); const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("active"); const [acting, setActing] = useState(null);
  const [adding, setAdding] = useState(false); const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState(null); const [editing, setEditing] = useState(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [sort, setSort] = useState("new"); // new | date_asc | date_desc
  const [showStats, setShowStats] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  // One-shot collection (Owing view): pick several unpaid gigs, log one payment.
  const [sel, setSel] = useState(() => new Set());
  const [collectOpen, setCollectOpen] = useState(false);
  const [colAmt, setColAmt] = useState(""); const [colMethod, setColMethod] = useState("UPI");
  const [colWhen, setColWhen] = useState(new Date().toLocaleDateString("en-CA"));
  const [colNote, setColNote] = useState(""); const [colBusy, setColBusy] = useState(false);
  const [cap, setCap] = useState(""); const [capBusy, setCapBusy] = useState(false);
  const [prefill, setPrefill] = useState(null); const [formKey, setFormKey] = useState(0);

  const runCapture = async () => {
    const text = cap.trim();
    if (!text) return;
    setCapBusy(true);
    const d = await parseEnquiry(text);
    setCapBusy(false);
    if (d.error) return showToast(d.error);
    setPrefill(d); setAdding(true); setFormKey((k) => k + 1); setCap("");
    showToast("Pulled the details — check and save.");
  };
  const openBlankForm = () => { setPrefill(null); setFormKey((k) => k + 1); setAdding((v) => !v); };

  const load = useCallback(async () => {
    setLoading(true);
    const [bk, pay] = await Promise.all([
      supabase.from("bookings").select("*").order("created_at", { ascending: false }),
      supabase.from("gig_payments").select("*").order("paid_on", { ascending: true }), // table may not exist yet → degrades to none
    ]);
    setRows(bk.data || []);
    const byB = {}; (pay.data || []).forEach((p) => { (byB[p.booking_id] = byB[p.booking_id] || []).push(p); });
    setPays(byB);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  // Leaving the Owing view drops any pending selection so it can't go stale.
  useEffect(() => { if (filter !== "owing") { setSel(new Set()); setCollectOpen(false); } }, [filter]);

  const paidOf = (id) => (pays[id] || []).reduce((s, p) => s + Number(p.amount || 0), 0);
  const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
  // What's still genuinely owed on a gig: fee − cash received − TDS deducted.
  const balOf = (r) => Number(r.agreed_fee || 0) - paidOf(r.id) - Number(r.tds_amount || 0);

  const decide = async (id, status) => {
    setActing(id);
    // 1) Set the status directly — the signed-in admin has the grants for this
    //    (same path as "Mark done & paid"), so confirming/declining never
    //    depends on the calendar Edge Function's service key being healthy.
    const { error: upErr } = await supabase.from("bookings").update({ status }).eq("id", id);
    if (upErr) { setActing(null); return showToast("Couldn't update — " + upErr.message); }

    // 2) Best-effort: add to / remove from Google Calendar. If the function is
    //    down (e.g. stale service key), the booking is already saved — just warn.
    const res = await fetch(`${FN}/calendar-sync?action=${status === "accepted" ? "confirm" : "release"}`, {
      method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ bookingId: id }),
    }).then((r) => r.json()).catch(() => ({ error: "Network error" }));
    setActing(null);

    const calFailed = res && res.error;
    if (status === "accepted") {
      showToast(calFailed
        ? `Confirmed & saved — but Google Calendar sync failed (${res.detail || res.error}). Use "Sync to calendar" once calendar-sync is fixed.`
        : "Confirmed — on your calendar.");
    } else {
      showToast(calFailed ? "Declined & saved (calendar not updated)." : "Declined.");
    }
    load();
  };

  const saveNote = async (id, notes) => {
    await supabase.from("bookings").update({ notes }).eq("id", id);
  };

  // Marking a gig completed says the EVENT is done — it never invents a
  // payment. Anything still owed stays tracked under "Owing" until the money
  // actually lands (that's what makes one-shot collection possible).
  const complete = async (r) => {
    const bal = balOf(r);
    if (bal > 0 && !window.confirm(`${inr(bal)} is still outstanding on this gig.\n\nMark it completed anyway?\n\nIt stays under "Owing" until you record the payment — use that when you collect several gigs in one go.`)) return;
    setActing(r.id);
    const { error } = await supabase.from("bookings").update({ status: "completed" }).eq("id", r.id);
    setActing(null);
    if (error) return showToast("Couldn't update — " + error.message);
    showToast(bal > 0 ? `Completed — ${inr(bal)} still to collect.` : "Completed & settled.");
    setOpenId(null); load();
  };

  // Bulk: everything confirmed whose date has passed → completed, in one go.
  const completePast = async () => {
    const today = new Date().toLocaleDateString("en-CA");
    const past = rows.filter((r) => r.status === "accepted" && r.event_date && (r.event_end_date || r.event_date) < today);
    if (!past.length) return showToast("No past confirmed gigs to complete.");
    const owed = past.reduce((s, r) => s + Math.max(0, balOf(r)), 0);
    if (!window.confirm(`Mark ${past.length} past gig${past.length > 1 ? "s" : ""} as completed?` +
      (owed > 0 ? `\n\n${inr(owed)} across them is still unpaid — that stays tracked under "Owing".` : ""))) return;
    setBulkBusy(true);
    const { error } = await supabase.from("bookings").update({ status: "completed" }).in("id", past.map((r) => r.id));
    setBulkBusy(false);
    if (error) return showToast("Couldn't update — " + error.message);
    showToast(`${past.length} gig${past.length > 1 ? "s" : ""} completed.`); load();
  };

  // One-shot collection: a single amount received, split across the selected
  // gigs oldest-first, writing one payment row per gig so each still balances.
  const collect = async () => {
    const total = Number(colAmt || 0);
    if (total <= 0) return showToast("Enter the amount you received.");
    if (total > selTotal + 0.5) return showToast(`That's more than the ${inr(selTotal)} outstanding on the selected gigs.`);
    const queue = [...selRows].sort((a, b) => (a.event_date || "").localeCompare(b.event_date || ""));
    let left = total;
    const inserts = [];
    for (const r of queue) {
      if (left <= 0) break;
      const due = Math.max(0, balOf(r));
      if (due <= 0) continue;
      const amt = Math.min(due, left);
      inserts.push({ booking_id: r.id, amount: amt, paid_on: colWhen, method: colMethod, note: colNote || "One-shot collection" });
      left -= amt;
    }
    if (!inserts.length) return showToast("Nothing outstanding on the selected gigs.");
    setColBusy(true);
    const { error } = await supabase.from("gig_payments").insert(inserts);
    setColBusy(false);
    if (error) return showToast(error.message.includes("gig_payments") ? "Run gig_finance.sql in Supabase first" : error.message);
    showToast(`${inr(total)} split across ${inserts.length} gig${inserts.length > 1 ? "s" : ""}.`);
    setSel(new Set()); setCollectOpen(false); setColAmt(""); setColNote(""); load();
  };
  const reopen = async (r) => {
    const { error } = await supabase.from("bookings").update({ status: "accepted" }).eq("id", r.id);
    if (error) return showToast("Couldn't update — " + error.message);
    showToast("Re-opened as confirmed."); load();
  };

  const whatsapp = (r) => {
    const num = waDigits(r.contact);
    const msg = encodeURIComponent(`Hi ${r.name}, this is Vic — thanks for your booking request for ${r.event_date}. `);
    if (num.length >= 10) window.open(`https://wa.me/${num}?text=${msg}`, "_blank");
    else window.open(`mailto:${r.contact}?subject=Your booking request&body=${msg}`, "_blank");
  };

  const q = query.trim().toLowerCase();
  const filtered = rows
    .filter((r) => {
      if (filter === "all") return true;
      if (filter === "active") return r.status === "pending" || r.status === "accepted";
      // Owing spans confirmed AND completed gigs: a finished gig you haven't
      // been paid for yet (e.g. DJ classes collected in one shot later) must
      // stay visible here, not vanish the moment it's marked completed.
      if (filter === "owing") return (r.status === "accepted" || r.status === "completed") && balOf(r) > 0;
      return r.status === filter;
    })
    .filter((r) => typeFilter === "all" || r.event_type === typeFilter)
    .filter((r) => !q || [r.name, r.contact, r.city, r.venue, r.event_type].some((v) => (v || "").toLowerCase().includes(q)));

  // Ordering. event_date is ISO (YYYY-MM-DD), so a plain string compare sorts
  // chronologically; undated gigs sink to the bottom in either direction.
  const sorted = [...filtered].sort((a, b) => {
    if (sort === "date_asc" || sort === "date_desc") {
      const av = a.event_date || "", bv = b.event_date || "";
      if (!av || !bv) return !av && !bv ? 0 : (!av ? 1 : -1);
      return sort === "date_asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    return new Date(b.created_at) - new Date(a.created_at); // newest enquiry
  });

  // Selection for one-shot collection (only meaningful in the Owing view).
  const selRows = sorted.filter((r) => sel.has(r.id));
  const selTotal = selRows.reduce((s, r) => s + Math.max(0, balOf(r)), 0);
  const toggleSel = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Money roll-up across confirmed + completed gigs (completed are fully past gigs;
  // they stay in the financial totals, just out of the working pipeline).
  const earned = rows.filter((r) => r.status === "accepted" || r.status === "completed");
  const booked = earned.reduce((s, r) => s + Number(r.agreed_fee || 0), 0);
  const received = earned.reduce((s, r) => s + paidOf(r.id), 0);
  const tdsTotal = earned.reduce((s, r) => s + Number(r.tds_amount || 0), 0);

  // Which sector (event_type) brings in how much — booked fees + received,
  // across the same confirmed+completed set the totals above use.
  const sectors = Object.values(earned.reduce((m, r) => {
    const k = r.event_type || "other";
    const e = m[k] || (m[k] = { type: k, booked: 0, received: 0, count: 0 });
    e.booked += Number(r.agreed_fee || 0); e.received += paidOf(r.id); e.count += 1;
    return m;
  }, {})).filter((s) => s.booked > 0).sort((a, b) => b.booked - a.booked);
  const sectorTop = Math.max(...sectors.map((s) => s.booked), 1);

  const exportCsv = () => {
    const cols = ["created_at", "status", "name", "contact", "event_type", "event_date", "venue", "city", "budget", "agreed_fee", "advance", "advance_due", "tds", "paid", "balance", "message"];
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [cols.join(","), ...sorted.map((r) => {
      const paid = paidOf(r.id);
      const tds = Number(r.tds_amount || 0);
      const advance = Number(r.advance_amount || 0);
      const row = { ...r, tds, paid, advance, advance_due: Math.max(0, advance - paid), balance: Number(r.agreed_fee || 0) - paid - tds };
      return cols.map((c) => esc(row[c])).join(",");
    })].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `djvic-bookings-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  // ── Detail view (rich per-gig: finance, mailer, notes, actions) ──
  if (openId) {
    const r = rows.find((x) => x.id === openId);
    if (!r) return <Center><Loader2 className="spin" size={18} /></Center>;
    if (editing && editing.id === openId) {
      return <BookingEditForm booking={r} onDone={() => { setEditing(null); load(); }} onCancel={() => setEditing(null)} showToast={showToast} />;
    }
    const [stLbl, stCol] = BK_STATUS[r.status] || [r.status, "#9a9a8a"];
    return (
      <>
        <div className="row-between">
          <button className="note-save" onClick={() => setOpenId(null)}>← Back to bookings</button>
          <span className="bk-st" style={{ color: "#161616", background: stCol }}>{stLbl}</span>
        </div>
        <h1 className="h1" style={{ marginTop: 10 }}>{r.name} {r.source === "manual" && <span className="mini">manual</span>}</h1>
        <p className="req-meta">
          <span className="tag">{r.event_type}</span>
          <span>{fmtRange(r.event_date, r.event_end_date)}</span>
          <span><MapPin size={12} /> {r.venue || "—"}, {r.city || "—"}</span>
          {r.budget && <span className="gold">{r.budget}</span>}
          {r.contact && r.contact !== "—" && <span>{r.contact}</span>}
        </p>
        {r.message && <p className="req-msg">{r.message}</p>}
        <GigFinance booking={r} payments={pays[r.id] || []} onChange={load} showToast={showToast} />
        <GigMailer booking={r} payments={pays[r.id] || []} onChange={load} showToast={showToast} />
        <NoteField initial={r.notes || ""} onSave={(n) => saveNote(r.id, n)} />
        <div className="req-actions">
          {r.status === "pending" && (
            <>
              <button className="act accept" disabled={acting === r.id} onClick={() => decide(r.id, "accepted")}>
                {acting === r.id ? <Loader2 className="spin" size={15} /> : <CheckCircle2 size={15} />} Confirm
              </button>
              <button className="act decline" disabled={acting === r.id} onClick={() => decide(r.id, "declined")}>
                <XCircle size={15} /> Decline
              </button>
            </>
          )}
          {r.status === "accepted" && !r.gcal_event_id && (
            <button className="act accept" disabled={acting === r.id} onClick={() => decide(r.id, "accepted")} title="This gig isn't on your Google Calendar yet">
              {acting === r.id ? <Loader2 className="spin" size={15} /> : <CalendarDays size={15} />} Sync to calendar
            </button>
          )}
          {r.status === "accepted" && (
            <button className="act accept" disabled={acting === r.id} onClick={() => complete(r)} title="Event done — archive it. Any unpaid balance stays tracked under Owing.">
              {acting === r.id ? <Loader2 className="spin" size={15} /> : <CheckCircle2 size={15} />} Mark completed
            </button>
          )}
          {r.status === "completed" && (
            <button className="act" onClick={() => reopen(r)}><RefreshCw size={15} /> Re-open</button>
          )}
          <button className="act" onClick={() => setEditing(r)}><Pencil size={15} /> Edit</button>
          <button className="act wa" onClick={() => whatsapp(r)}><MessageCircle size={15} /> Reply</button>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{`
        .bk-wrap { overflow-x: auto; margin-top: 8px; }
        .bk-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
        .bk-table th { text-align: left; padding: 8px 10px; color: #8a8878; font-weight: 600; font-size: 10.5px; text-transform: uppercase; letter-spacing: .07em; border-bottom: 1px solid #2a2a2a; white-space: nowrap; }
        .bk-table td { padding: 10px; border-bottom: 1px solid #1c1c1c; vertical-align: middle; }
        .bk-table tbody tr:hover td { background: #141414; }
        .bk-name { font-weight: 600; color: #e8e8e0; }
        .bk-sub { color: #8a8878; font-size: 12px; }
        .bk-st { font-size: 11.5px; font-weight: 600; padding: 3px 9px; border-radius: 99px; white-space: nowrap; display: inline-block; }
        .bk-actions { white-space: nowrap; text-align: right; }
        .bk-ic { background: none; border: 1px solid #2a2a2a; border-radius: 6px; padding: 6px; color: #cfcabf; cursor: pointer; margin-left: 4px; line-height: 0; }
        .bk-ic:hover { border-color: #c9a84c; color: #c9a84c; }
        .bk-ic.green:hover { border-color: #4ea765; color: #4ea765; }
        .bk-ic.danger:hover { border-color: #e0574a; color: #e0574a; }
        .bk-ic:disabled { opacity: .5; cursor: default; }
        @media (max-width: 720px) { .bk-table { min-width: 720px; } }
        .bk-sectors { background: #121214; border: 1px solid #232323; border-radius: 8px; padding: 12px 14px; margin: 0 0 12px; }
        .bk-sectors-head { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; flex-wrap: wrap; margin-bottom: 9px; }
        .bk-sectors-head > span:first-child { color: #8a8878; font-size: 10.5px; text-transform: uppercase; letter-spacing: .07em; font-weight: 600; }
        .bk-sectors-sub { color: #c9a84c; font-size: 12px; font-weight: 600; }
        .bk-sec { display: flex; align-items: center; gap: 12px; padding: 5px 0; }
        .bk-sec-label { flex: 0 0 28%; min-width: 92px; color: #cfcabf; font-size: 13px; text-transform: capitalize; display: flex; align-items: center; gap: 7px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .bk-sec-n { background: #232323; color: #8a8878; font-size: 10.5px; padding: 1px 6px; border-radius: 99px; flex-shrink: 0; }
        .bk-sec-bar { flex: 1; height: 9px; background: #1a1a1a; border-radius: 5px; overflow: hidden; }
        .bk-sec-bar > span { display: block; height: 100%; background: linear-gradient(90deg, #a8842f, #c9a84c); border-radius: 5px; }
        .bk-sec-val { flex: 0 0 auto; min-width: 92px; text-align: right; color: #e8e8e0; font-size: 13px; font-weight: 600; white-space: nowrap; }
        .bk-sec-pct { color: #8a8878; font-weight: 500; font-size: 11.5px; margin-left: 6px; }
      `}</style>
      <div className="row-between">
        <h1 className="h1">Bookings</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className={showStats ? "btn sm" : "btn sm ghost"} onClick={() => setShowStats((v) => !v)}><TrendingUp size={15} /> Stats</button>
          <button className="btn sm ghost" onClick={completePast} disabled={bulkBusy} title="Mark every confirmed gig whose date has passed as completed. Unpaid ones stay under Owing.">
            {bulkBusy ? <Loader2 size={15} className="spin" /> : <CheckCircle2 size={15} />} Complete past
          </button>
          <button className="btn sm" onClick={exportCsv}>Export CSV</button>
          <button className="btn sm" onClick={openBlankForm}><Plus size={15} /> Log enquiry</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "2px 0 12px" }}>
        <input className="search" style={{ flex: "1 1 260px", margin: 0 }} placeholder="Quick-log — type or 🎤 dictate the enquiry, then Auto-fill…"
          value={cap} onChange={(e) => setCap(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") runCapture(); }} />
        <button className="btn" disabled={capBusy || !cap.trim()} onClick={runCapture}>
          {capBusy ? <><Loader2 className="spin" size={15} /> Reading…</> : <><Sparkles size={15} /> Auto-fill</>}
        </button>
      </div>

      {showStats && (<>
      <div className="cards" style={{ marginBottom: 6 }}>
        <Stat label="Booked · confirmed" value={inr(booked)} hint="Agreed fees on confirmed gigs" />
        <Stat label="Received" value={inr(received)} hint="Cash received so far" />
        {tdsTotal > 0 && <Stat label="TDS deducted" value={inr(tdsTotal)} hint="Withheld & paid to govt" />}
        <Stat label="Outstanding" value={inr(booked - received - tdsTotal)} hint="Still to collect (net of TDS)" />
      </div>

      {sectors.length > 0 ? (
        <div className="bk-sectors">
          <div className="bk-sectors-head">
            <span>Revenue by sector</span>
            <span className="bk-sectors-sub">{inr(booked)} booked · confirmed + completed</span>
          </div>
          {sectors.map((s) => (
            <div className="bk-sec" key={s.type} title={`${s.count} gig${s.count > 1 ? "s" : ""} · ${inr(s.received)} received`}>
              <span className="bk-sec-label">{s.type}<span className="bk-sec-n">{s.count}</span></span>
              <span className="bk-sec-bar"><span style={{ width: `${Math.round((s.booked / sectorTop) * 100)}%` }} /></span>
              <span className="bk-sec-val">{inr(s.booked)}<span className="bk-sec-pct">{Math.round((s.booked / booked) * 100)}%</span></span>
            </div>
          ))}
        </div>
      ) : (
        <p className="empty" style={{ padding: "8px 2px" }}>No sector revenue yet — set agreed fees on confirmed gigs to see the split.</p>
      )}
      </>)}

      {adding && <ManualEntry key={formKey} initial={prefill} onDone={() => { setAdding(false); setPrefill(null); load(); }} showToast={showToast} />}

      <div className="chips">
        {[["active", "Active"], ["pending", "Enquiries"], ["accepted", "Confirmed"], ["owing", "Owing"], ["completed", "Completed"], ["declined", "Declined"], ["all", "All"]].map(([f, l]) => (
          <button key={f} className={filter === f ? "chip on" : "chip"} onClick={() => setFilter(f)}>{l}</button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input className="search" style={{ flex: "1 1 220px", margin: 0 }} placeholder="Search name, contact, city…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className="search" style={{ width: "auto", margin: 0 }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="all">All types</option>
          {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="search" style={{ width: "auto", margin: 0 }} value={sort} onChange={(e) => setSort(e.target.value)} title="Order the list">
          <option value="new">Newest enquiry</option>
          <option value="date_asc">Event date ↑ (soonest first)</option>
          <option value="date_desc">Event date ↓ (latest first)</option>
        </select>
      </div>

      {filter === "owing" && sorted.length > 0 && (
        <div style={{ background: "rgba(201,168,76,.06)", border: "1px solid rgba(201,168,76,.22)", borderRadius: 8, padding: "10px 12px", margin: "10px 0", fontSize: ".82rem" }}>
          {sel.size === 0 ? (
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", color: "rgba(255,255,255,.7)" }}>
              <span>Collecting several gigs in one payment? Tick them below.</span>
              <button className="btn sm ghost" style={{ marginLeft: "auto" }} onClick={() => setSel(new Set(sorted.map((r) => r.id)))}>Select all {sorted.length}</button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ color: "rgba(255,255,255,.75)" }}><strong style={{ color: "#c9a84c" }}>{sel.size}</strong> selected · outstanding <strong style={{ color: "#ff8a8a" }}>{inr(selTotal)}</strong></span>
              {collectOpen ? (
                <>
                  <input type="number" value={colAmt} onChange={(e) => setColAmt(e.target.value)} placeholder="Amount ₹"
                    style={{ background: "rgba(10,10,10,.6)", border: "1px solid var(--line)", borderRadius: 6, padding: "6px 9px", color: "var(--off)", fontSize: ".8rem", width: 110 }} />
                  <select value={colMethod} onChange={(e) => setColMethod(e.target.value)} style={{ background: "rgba(10,10,10,.6)", border: "1px solid var(--line)", borderRadius: 6, padding: "6px 9px", color: "var(--off)", fontSize: ".8rem" }}>
                    <option>UPI</option><option>Cash</option><option>Bank</option><option>Card</option><option>Other</option>
                  </select>
                  <input type="date" value={colWhen} onChange={(e) => setColWhen(e.target.value)}
                    style={{ background: "rgba(10,10,10,.6)", border: "1px solid var(--line)", borderRadius: 6, padding: "6px 9px", color: "var(--off)", fontSize: ".8rem" }} />
                  <input type="text" value={colNote} onChange={(e) => setColNote(e.target.value)} placeholder="Note (e.g. DJ classes)"
                    style={{ background: "rgba(10,10,10,.6)", border: "1px solid var(--line)", borderRadius: 6, padding: "6px 9px", color: "var(--off)", fontSize: ".8rem", width: 150 }} />
                  <button className="btn sm" onClick={collect} disabled={colBusy}>{colBusy ? <Loader2 size={12} className="spin" /> : "Record"}</button>
                  <button className="btn sm ghost" onClick={() => setCollectOpen(false)}>Cancel</button>
                </>
              ) : (
                <button className="btn sm" onClick={() => { setColAmt(String(selTotal)); setCollectOpen(true); }}>Collect payment</button>
              )}
              <button className="btn sm ghost" style={{ marginLeft: "auto" }} onClick={() => { setSel(new Set()); setCollectOpen(false); }}>Clear</button>
            </div>
          )}
          {collectOpen && <p style={{ margin: "8px 0 0", color: "rgba(255,255,255,.5)", fontSize: ".74rem" }}>Split oldest gig first across the selected gigs — one payment row each, so every gig still balances on its own.</p>}
        </div>
      )}

      {loading ? <Center><Loader2 className="spin" size={18} /></Center> : sorted.length === 0 ? (
        <p className="empty">Nothing here.</p>
      ) : (
        <div className="bk-wrap">
          <table className="bk-table">
            <thead><tr>{filter === "owing" && <th style={{ width: 28 }}></th>}<th>Client</th><th>Type</th><th>Date(s)</th><th>Value</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {sorted.map((r) => {
                const [stLbl, stCol] = BK_STATUS[r.status] || [r.status, "#9a9a8a"];
                const owingAmt = (r.status === "accepted" || r.status === "completed") ? Math.max(0, balOf(r)) : 0;
                const owing = owingAmt > 0;
                const value = r.agreed_fee != null ? inr(r.agreed_fee) : (r.budget || "—");
                return (
                  <tr key={r.id} style={{ cursor: "pointer" }} title={r.message || ""} onClick={() => setOpenId(r.id)}>
                    {filter === "owing" && (
                      <td onClick={(e) => e.stopPropagation()} style={{ textAlign: "center" }}>
                        <input type="checkbox" checked={sel.has(r.id)} onChange={() => toggleSel(r.id)}
                          title={`Outstanding ${inr(Math.max(0, balOf(r)))}`} style={{ accentColor: "#c9a84c", cursor: "pointer" }} />
                      </td>
                    )}
                    <td>
                      <div className="bk-name">{r.name} {r.source === "manual" && <span className="mini">manual</span>}</div>
                      <div className="bk-sub">{[r.venue, r.city].filter(Boolean).join(", ") || "—"}</div>
                    </td>
                    <td><span className="tag">{r.event_type}</span></td>
                    <td style={{ whiteSpace: "nowrap" }}>{fmtRange(r.event_date, r.event_end_date)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{value}{owing && <div className="bk-sub" style={{ color: "#e0b13c" }}>{inr(owingAmt)} owing</div>}</td>
                    <td><span className="bk-st" style={{ color: "#161616", background: stCol }}>{stLbl}</span></td>
                    <td className="bk-actions" onClick={(e) => e.stopPropagation()}>
                      {r.status === "pending" && (
                        <>
                          <button className="bk-ic green" title="Confirm" disabled={acting === r.id} onClick={() => decide(r.id, "accepted")}>{acting === r.id ? <Loader2 className="spin" size={14} /> : <CheckCircle2 size={14} />}</button>
                          <button className="bk-ic danger" title="Decline" disabled={acting === r.id} onClick={() => decide(r.id, "declined")}><XCircle size={14} /></button>
                        </>
                      )}
                      <button className="bk-ic" title="Reply" onClick={() => whatsapp(r)}><MessageCircle size={14} /></button>
                      <button className="bk-ic" title="Open" onClick={() => setOpenId(r.id)}><Eye size={14} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ── Per-gig financials: agreed fee + a payments ledger (gig_payments) ──
function GigFinance({ booking, payments, onChange, showToast }) {
  const [fee, setFee] = useState(booking.agreed_fee ?? "");
  const [tds, setTds] = useState(booking.tds_amount ?? "");
  const [advance, setAdvance] = useState(booking.advance_amount ?? "");
  const [savingFee, setSavingFee] = useState(false);
  const [adding, setAdding] = useState(false);
  const [amt, setAmt] = useState(""); const [method, setMethod] = useState("UPI");
  const [payNote, setPayNote] = useState("");
  const [when, setWhen] = useState(new Date().toLocaleDateString("en-CA"));
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setFee(booking.agreed_fee ?? ""); setTds(booking.tds_amount ?? ""); setAdvance(booking.advance_amount ?? "");
  }, [booking.agreed_fee, booking.tds_amount, booking.advance_amount]);

  const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
  const paid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const feeNum = Number(fee || 0);
  const tdsNum = Number(tds || 0);
  const settled = paid + tdsNum;          // cash received + TDS deducted = fully accounted
  const bal = feeNum - settled;           // what's genuinely still owed
  // Advance = the agreed blocking amount. What's still to come in for it is the
  // advance minus whatever has already been received against this gig.
  const advNum = Number(advance || 0);
  const advDue = Math.max(0, advNum - paid);
  const st = !feeNum ? { t: "no fee set", c: "#9a9a92", bg: "transparent" }
    : settled >= feeNum ? { t: tdsNum > 0 ? "settled (net of TDS)" : "paid in full", c: "#7fe0a0", bg: "#16331f" }
    : advDue > 0 ? { t: "advance due", c: "#ff8a8a", bg: "rgba(255,59,59,.1)" }
    : paid > 0 ? { t: advNum > 0 ? "advance received · balance due" : "part paid", c: "#c9a84c", bg: "rgba(201,168,76,.12)" }
    : { t: "unpaid", c: "#ff8a8a", bg: "rgba(255,59,59,.1)" };
  const sqlHint = (m) => {
    const s = m || "";
    if (/permission denied/i.test(s)) return "Fee not saved — DB permission issue. Run bookings_fee_grant_fix.sql in Supabase.";
    if (/agreed_fee|gig_payments|relation|does not exist/i.test(s)) return "Run gig_finance.sql in Supabase first";
    return s;
  };

  const saveFee = async () => {
    setSavingFee(true);
    const { error } = await supabase.from("bookings").update({
      agreed_fee: fee === "" ? null : Number(fee),
      tds_amount: tds === "" ? null : Number(tds),
      advance_amount: advance === "" ? null : Number(advance),
    }).eq("id", booking.id);
    setSavingFee(false);
    if (error) showToast(sqlHint(error.message)); else { showToast("Saved ✓"); onChange(); }
  };
  const dirty = String(fee) !== String(booking.agreed_fee ?? "")
    || String(tds) !== String(booking.tds_amount ?? "")
    || String(advance) !== String(booking.advance_amount ?? "");
  const addPayment = async () => {
    if (!amt || Number(amt) <= 0) return showToast("Enter an amount");
    setBusy(true);
    const { error } = await supabase.from("gig_payments").insert({ booking_id: booking.id, amount: Number(amt), paid_on: when, method, note: payNote || null });
    setBusy(false);
    if (error) return showToast(sqlHint(error.message));
    setAmt(""); setPayNote(""); setAdding(false); showToast("Payment recorded ✓"); onChange();
  };
  const delPayment = async (id) => { if (!confirm("Remove this payment?")) return; await supabase.from("gig_payments").delete().eq("id", id); onChange(); };

  const inp = { background: "rgba(10,10,10,.6)", border: "1px solid var(--line)", borderRadius: 6, padding: "6px 9px", color: "var(--off)", fontSize: ".8rem", fontFamily: "Inter" };

  return (
    <div style={{ background: "rgba(201,168,76,0.05)", border: "1px solid rgba(201,168,76,0.15)", borderRadius: 8, padding: "10px 12px", margin: "8px 0", fontSize: ".82rem" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: "rgba(255,255,255,.5)", fontSize: ".66rem", textTransform: "uppercase", letterSpacing: ".06em" }}>Fee ₹</span>
          <input type="number" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="0" style={{ ...inp, width: 92 }} />
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: "rgba(255,255,255,.5)", fontSize: ".66rem", textTransform: "uppercase", letterSpacing: ".06em" }} title="Amount agreed up front to block the date">Advance ₹</span>
          <input type="number" value={advance} onChange={(e) => setAdvance(e.target.value)} placeholder="0" style={{ ...inp, width: 84 }} />
          <button className="btn sm ghost" title="25% of the fee" onClick={() => setAdvance(feeNum ? String(Math.round(feeNum * 0.25)) : "")} disabled={!feeNum}>25%</button>
          <button className="btn sm ghost" title="50% of the fee" onClick={() => setAdvance(feeNum ? String(Math.round(feeNum * 0.5)) : "")} disabled={!feeNum}>50%</button>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: "rgba(255,255,255,.5)", fontSize: ".66rem", textTransform: "uppercase", letterSpacing: ".06em" }}>TDS ₹</span>
          <input type="number" value={tds} onChange={(e) => setTds(e.target.value)} placeholder="0" style={{ ...inp, width: 76 }} />
          <button className="btn sm ghost" title="10% of the fee" onClick={() => setTds(feeNum ? String(Math.round(feeNum * 0.1)) : "")} disabled={!feeNum}>10%</button>
        </span>
        <button className="btn sm" onClick={saveFee} disabled={savingFee || !dirty}>{savingFee ? <Loader2 size={12} className="spin" /> : "Save"}</button>
        <span style={{ marginLeft: "auto", color: st.c, background: st.bg, padding: "3px 10px", borderRadius: 20, fontSize: ".64rem", textTransform: "uppercase", letterSpacing: ".06em" }}>{st.t}</span>
      </div>
      <div style={{ marginTop: 7, display: "flex", flexWrap: "wrap", gap: 14, fontSize: ".8rem", color: "rgba(255,255,255,.7)" }}>
        <span>Received <strong style={{ color: "#7fe0a0" }}>{inr(paid)}</strong></span>
        {advNum > 0 && (
          advDue > 0
            ? <span>Advance due <strong style={{ color: "#ff8a8a" }}>{inr(advDue)}</strong> <span style={{ opacity: .6 }}>of {inr(advNum)}</span></span>
            : <span>Advance <strong style={{ color: "#7fe0a0" }}>{inr(advNum)}</strong> <span style={{ opacity: .6 }}>received</span></span>
        )}
        {tdsNum > 0 && <span>TDS deducted <strong style={{ color: "#c9a84c" }}>{inr(tdsNum)}</strong></span>}
        <span>{advNum > 0 && advDue <= 0 ? "Balance on the date" : "Due"} <strong style={{ color: bal > 0 ? "#ff8a8a" : "#7fe0a0" }}>{inr(bal)}</strong></span>
      </div>

      {payments.length > 0 && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
          {payments.map((p) => (
            <div key={p.id} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: ".72rem", color: "rgba(255,255,255,.6)" }}>
              <strong style={{ color: "#7fe0a0" }}>{inr(p.amount)}</strong>
              <span>{p.method || "—"}</span>
              {p.note && <span style={{ color: "#c9a84c" }}>{p.note}</span>}
              <span>{new Date(p.paid_on).toLocaleDateString("en-IN")}</span>
              <button onClick={() => delPayment(p.id)} title="Remove" style={{ marginLeft: "auto", background: "none", border: "none", color: "#ff8a8a", cursor: "pointer", padding: 0 }}><Trash2 size={12} /></button>
            </div>
          ))}
        </div>
      )}

      {adding ? (
        <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          <input type="number" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="Amount ₹" style={{ ...inp, width: 104 }} />
          {advDue > 0 && (
            <button className="btn sm ghost" title={`Fill the outstanding advance (${inr(advDue)})`}
              onClick={() => { setAmt(String(advDue)); setPayNote("Advance"); }}>Advance</button>
          )}
          {bal > 0 && (
            <button className="btn sm ghost" title={`Fill the full balance (${inr(bal)})`}
              onClick={() => { setAmt(String(bal)); setPayNote("Balance"); }}>Balance</button>
          )}
          <select value={method} onChange={(e) => setMethod(e.target.value)} style={inp}>
            <option>UPI</option><option>Cash</option><option>Bank</option><option>Card</option><option>Other</option>
          </select>
          <input type="date" value={when} onChange={(e) => setWhen(e.target.value)} style={inp} />
          <input type="text" value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="Note (e.g. Advance)" style={{ ...inp, width: 130 }} />
          <button className="btn sm" onClick={addPayment} disabled={busy}>{busy ? <Loader2 size={12} className="spin" /> : "Add"}</button>
          <button className="btn sm ghost" onClick={() => { setAdding(false); setPayNote(""); }}>Cancel</button>
        </div>
      ) : (
        <button className="btn sm" style={{ marginTop: 8 }} onClick={() => setAdding(true)}><Plus size={13} /> Record payment</button>
      )}
    </div>
  );
}

// ── One-click gig emails: confirmation / invoice (HTML + PDF) / follow-up ──
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());
const rupee = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function invoiceNumber() { const d = new Date(); const p = (x) => String(x).padStart(2, "0"); return `${p(d.getDate())}${p(d.getMonth() + 1)}${d.getFullYear()}`; }
function addDays(days) { const d = new Date(); d.setDate(d.getDate() + Number(days || 0)); return d; }
const niceDate = (d) => d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });

function buildInvoiceHTML({ biller, invNo, dateStr, dueStr, terms, billTo, item, qty, rate, total, paid }) {
  const bank = biller.bank || {};
  const notes = [
    biller.upi ? `UPI: ${biller.upi}` : null,
    "BANK DETAILS",
    bank.beneficiary ? `Beneficiary: ${bank.beneficiary}` : null,
    bank.bank ? `Bank: ${bank.bank}` : null,
    bank.branch ? `Branch: ${bank.branch}` : null,
    bank.account ? `A/c No: ${bank.account}` : null,
    bank.ifsc ? `IFSC: ${bank.ifsc}` : null,
    biller.pan ? `PAN: ${biller.pan}` : null,
  ].filter(Boolean);
  const balance = total - paid;
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2433;width:760px;padding:44px;background:#fff;box-sizing:border-box;">
    <table style="width:100%;border-collapse:collapse"><tr>
      <td style="vertical-align:top">
        <div style="font-size:22px;font-weight:800;letter-spacing:.5px">${biller.name}</div>
        ${(biller.address || []).map((a) => `<div style="font-size:12px;color:#6b7280;margin-top:3px">${a}</div>`).join("")}
        <div style="font-size:12px;color:#6b7280">${biller.phone || ""}</div>
        <div style="font-size:12px;color:#6b7280">${biller.email || ""}</div>
        ${biller.pan ? `<div style="font-size:12px;color:#6b7280">PAN: ${biller.pan}</div>` : ""}
      </td>
      <td style="vertical-align:top;text-align:right">
        <div style="font-size:34px;font-weight:800;letter-spacing:1px;color:#111827">INVOICE</div>
        <div style="font-size:14px;color:#9ca3af;margin-top:2px">#${invNo}</div>
      </td>
    </tr></table>
    <div style="border-top:1px solid #e5e7eb;margin:26px 0"></div>
    <table style="width:100%;border-collapse:collapse"><tr>
      <td style="vertical-align:top">
        <div style="font-size:11px;color:#9ca3af;letter-spacing:.06em">BILL TO</div>
        <div style="font-size:14px;font-weight:700;margin-top:5px">${billTo.company || "—"}</div>
        ${billTo.gstin ? `<div style="font-size:12px;color:#6b7280">GST no. ${billTo.gstin}</div>` : ""}
        ${billTo.address ? `<div style="font-size:12px;color:#6b7280;white-space:pre-line;margin-top:2px">${billTo.address}</div>` : ""}
      </td>
      <td style="vertical-align:top;text-align:right;font-size:12px;color:#374151">
        <div><span style="color:#9ca3af">Date</span>&nbsp;&nbsp;&nbsp;${dateStr}</div>
        <div style="margin-top:7px"><span style="color:#9ca3af">Payment Terms</span>&nbsp;&nbsp;&nbsp;${terms} days</div>
        <div style="margin-top:7px"><span style="color:#9ca3af">Due Date</span>&nbsp;&nbsp;&nbsp;${dueStr}</div>
      </td>
    </tr></table>
    <table style="width:100%;border-collapse:collapse;margin-top:30px">
      <thead><tr style="background:#f9fafb;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb">
        <th style="text-align:left;padding:11px;font-size:12px;color:#6b7280">Item</th>
        <th style="text-align:right;padding:11px;font-size:12px;color:#6b7280">Qty</th>
        <th style="text-align:right;padding:11px;font-size:12px;color:#6b7280">Rate</th>
        <th style="text-align:right;padding:11px;font-size:12px;color:#6b7280">Amount</th>
      </tr></thead>
      <tbody><tr style="border-bottom:1px solid #f0f0f0">
        <td style="padding:15px 11px;font-size:13px">${item}</td>
        <td style="padding:15px 11px;font-size:13px;text-align:right">${qty}</td>
        <td style="padding:15px 11px;font-size:13px;text-align:right">${rupee(rate)}</td>
        <td style="padding:15px 11px;font-size:13px;text-align:right">${rupee(rate * qty)}</td>
      </tr></tbody>
    </table>
    <table style="width:100%;border-collapse:collapse;margin-top:6px"><tr><td></td><td style="width:280px">
      <table style="width:100%;font-size:13px">
        <tr><td style="padding:6px 11px;color:#6b7280;text-align:right">Subtotal</td><td style="padding:6px 11px;text-align:right">${rupee(total)}</td></tr>
        <tr><td style="padding:8px 11px;text-align:right;font-weight:700;border-top:1px solid #e5e7eb">Total</td><td style="padding:8px 11px;text-align:right;font-weight:700;border-top:1px solid #e5e7eb">${rupee(total)}</td></tr>
        ${paid > 0 ? `<tr><td style="padding:6px 11px;color:#6b7280;text-align:right">Paid</td><td style="padding:6px 11px;text-align:right">−${rupee(paid)}</td></tr>` : ""}
        <tr><td style="padding:9px 11px;text-align:right;font-weight:800;font-size:15px">Balance Due</td><td style="padding:9px 11px;text-align:right;font-weight:800;font-size:15px">${rupee(balance)}</td></tr>
      </table>
    </td></tr></table>
    <div style="margin-top:34px">
      <div style="font-size:11px;color:#9ca3af;letter-spacing:.06em">NOTES</div>
      ${notes.map((l) => `<div style="font-size:12px;color:#374151;margin-top:3px">${l}</div>`).join("")}
    </div>
  </div>`;
}

function plainEmailHTML(title, bodyLines) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2433;max-width:560px;margin:0 auto;padding:8px 4px">
    <div style="height:4px;background:#C9A84C"></div>
    <div style="padding:24px 4px">
      <div style="font-size:18px;font-weight:800;letter-spacing:.5px;margin-bottom:14px">${title}</div>
      ${bodyLines.map((l) => `<p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 12px">${l}</p>`).join("")}
      <p style="font-size:14px;color:#374151;margin:18px 0 0">— DJ VIC</p>
    </div>
  </div>`;
}

function GigMailer({ booking, payments, onChange, showToast }) {
  const [open, setOpen] = useState(false);
  const [billers, setBillers] = useState(null);
  const [mode, setMode] = useState("invoice");
  const [email, setEmail] = useState(booking.client_email || (isEmail(booking.contact) ? booking.contact : ""));
  const [billerKey, setBillerKey] = useState("vic");
  const [company, setCompany] = useState(booking.client_company || booking.name || "");
  const [gstin, setGstin] = useState(booking.client_gstin || "");
  const [address, setAddress] = useState(booking.client_address || "");
  const [desc, setDesc] = useState(`DJ services — ${booking.event_type || "event"}${booking.venue ? ` at ${booking.venue}` : ""}`);
  const [terms, setTerms] = useState(7);
  const [busy, setBusy] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (!open || billers) return;
    (async () => {
      const r = await fetch(`${FN}/gig-mailer?action=billers`, { method: "POST", headers: await authHeader() }).then((x) => x.json()).catch(() => null);
      if (r && !r.error && (r.vic || r.vr)) setBillers(r);
      else showToast("gig-mailer isn't deployed / BILLERS_JSON not set yet");
    })();
  }, [open]);

  const total = Number(booking.agreed_fee || 0);
  const paid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const invNo = invoiceNumber();
  const dueStr = niceDate(addDays(terms));
  const dateStr = niceDate(new Date());
  const biller = billers ? (billers[billerKey] || billers.vic || billers.vr) : null;

  // Only recompute when invoice-relevant fields change (not on every keystroke in e.g. email)
  const invHTML = useMemo(() => biller ? buildInvoiceHTML({
    biller, invNo, dateStr, dueStr, terms,
    billTo: { company, gstin, address }, item: desc, qty: 1, rate: total, total, paid,
  }) : "", [biller, invNo, dateStr, dueStr, terms, company, gstin, address, desc, total, paid]);

  const persist = () => supabase.from("bookings").update({
    client_email: email || null, client_company: company || null, client_gstin: gstin || null, client_address: address || null,
  }).eq("id", booking.id).then(() => onChange && onChange());

  const fileName = `Invoice-${invNo}-${(company || "client").replace(/[^a-z0-9]+/gi, "-").slice(0, 28)}.pdf`;

  // Build the invoice PDF from bundled jsPDF + html2canvas (no CDN at runtime).
  async function makePdf() {
    const [{ jsPDF: JsPDF }, h2c] = await Promise.all([import("jspdf"), import("html2canvas")]);
    const html2canvas = h2c.default || h2c;
    const holder = document.createElement("div");
    holder.style.cssText = "position:fixed;left:-10000px;top:0;background:#fff";
    holder.innerHTML = invHTML;
    document.body.appendChild(holder);
    let canvas;
    try { canvas = await html2canvas(holder.firstElementChild || holder, { scale: 2, backgroundColor: "#ffffff", useCORS: true }); }
    finally { document.body.removeChild(holder); }
    const imgData = canvas.toDataURL("image/jpeg", 0.95);
    const pdf = new JsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
    const pageW = pdf.internal.pageSize.getWidth(), pageH = pdf.internal.pageSize.getHeight();
    const imgH = (canvas.height * pageW) / canvas.width;
    let heightLeft = imgH, position = 0;
    pdf.addImage(imgData, "JPEG", 0, position, pageW, imgH); heightLeft -= pageH;
    while (heightLeft > 0) { position -= pageH; pdf.addPage(); pdf.addImage(imgData, "JPEG", 0, position, pageW, imgH); heightLeft -= pageH; }
    return pdf;
  }

  async function downloadInvoice() {
    if (!biller) return showToast("Pick a biller first");
    if (total <= 0) return showToast("Set the gig Fee first — invoice is ₹0");
    setBusy(true);
    try { (await makePdf()).save(fileName); persist(); showToast("Invoice downloaded ✓"); }
    catch (e) { showToast("Couldn't build PDF: " + String(e.message || e)); }
    setBusy(false);
  }

  async function whatsappInvoice() {
    await downloadInvoice();
    const num = waDigits(booking.contact || "");
    const msg = encodeURIComponent(`Hi ${booking.name || "there"}, please find attached the invoice for ${desc}. Balance due: ${rupee(total - paid)}. Thank you!`);
    window.open(num.length >= 10 ? `https://wa.me/${num}?text=${msg}` : `https://wa.me/?text=${msg}`, "_blank");
  }

  async function send() {
    if (!isEmail(email)) return showToast("Add a valid client email");
    if (mode === "invoice" && !biller) return showToast("Billers not loaded — deploy gig-mailer first");
    setBusy(true);
    try {
      let subject, html, attachments;
      if (mode === "invoice") {
        const b64 = (await makePdf()).output("datauristring").split(",")[1];
        subject = `Invoice #${invNo} — ${biller.name}`;
        html = plainEmailHTML(`Invoice from ${biller.name}`, [
          `Hi ${booking.name || "there"},`,
          `Please find attached the invoice for <strong>${desc}</strong>.`,
          `<strong>Balance due: ${rupee(total - paid)}</strong> · Payment terms: ${terms} days (due ${dueStr}).`,
          biller.upi ? `You can pay via UPI to <strong>${biller.upi}</strong>, or by bank transfer (details on the invoice).` : `Bank transfer details are on the invoice.`,
          `Thank you!`,
        ]);
        attachments = [{ filename: `Invoice-${invNo}.pdf`, contentBase64: b64 }];
      } else if (mode === "confirmation") {
        subject = `Your booking with DJ VIC is confirmed — ${booking.event_date}`;
        html = plainEmailHTML("Booking confirmed", [
          `Hi ${booking.name || "there"},`,
          `Your booking is confirmed for <strong>${booking.event_date}</strong>${booking.venue ? ` at <strong>${booking.venue}</strong>` : ""}.`,
          total ? `Agreed fee: <strong>${rupee(total)}</strong>${paid > 0 ? ` · Advance received: ${rupee(paid)} · Balance: ${rupee(total - paid)}` : ""}.` : `Looking forward to it!`,
          `I'll be in touch with the run-of-show closer to the date. Reply here anytime.`,
        ]);
      } else {
        subject = `Following up — your event with DJ VIC`;
        html = plainEmailHTML("Quick follow-up", [
          `Hi ${booking.name || "there"},`,
          `Just following up regarding your ${booking.event_type || "event"}${booking.event_date ? ` on ${booking.event_date}` : ""}.`,
          total - paid > 0 ? `A balance of <strong>${rupee(total - paid)}</strong> is outstanding — happy to share payment details whenever convenient.` : `Let me know if there's anything you need from my side.`,
          `Thanks!`,
        ]);
      }

      const res = await fetch(`${FN}/gig-mailer?action=send`, {
        method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({
          bookingId: booking.id, kind: mode, biller: mode === "invoice" ? billerKey : null,
          invoiceNo: mode === "invoice" ? invNo : null, amount: total,
          to: email, fromName: mode === "invoice" ? biller.name : "DJ VIC",
          replyTo: mode === "invoice" ? biller.email : "bookings@djvicofficial.com",
          subject, html, attachments,
        }),
      }).then((x) => x.json()).catch(() => ({ error: "Network error" }));
      if (res.error) showToast("Send failed: " + JSON.stringify(res.error).slice(0, 140));
      else { showToast(`${mode === "invoice" ? "Invoice" : mode === "confirmation" ? "Confirmation" : "Follow-up"} sent ✓`); persist(); }
    } catch (e) { showToast("Error: " + String(e.message || e)); }
    setBusy(false);
  }

  const inp = { background: "rgba(10,10,10,.6)", border: "1px solid var(--line)", borderRadius: 6, padding: "6px 9px", color: "var(--off)", fontSize: ".8rem", fontFamily: "Inter", width: "100%" };
  const lbl = { fontSize: ".62rem", letterSpacing: ".06em", textTransform: "uppercase", color: "rgba(255,255,255,.45)", marginBottom: 3, display: "block" };

  if (!open) return (
    <button className="btn sm" style={{ margin: "4px 0 0" }} onClick={() => setOpen(true)}><Mail size={13} /> Email / Invoice</button>
  );

  return (
    <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--line)", borderRadius: 8, padding: 12, margin: "8px 0" }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        {[["invoice", "Invoice"], ["confirmation", "Confirmation"], ["followup", "Follow-up"]].map(([k, l]) => (
          <button key={k} className={mode === k ? "chip on" : "chip"} onClick={() => setMode(k)}>{l}</button>
        ))}
        <button className="btn sm ghost" style={{ marginLeft: "auto" }} onClick={() => setOpen(false)}>Close</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div><span style={lbl}>Client email</span><input style={inp} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@email.com" /></div>
        {mode === "invoice" && <div><span style={lbl}>Invoice from</span>
          <select style={inp} value={billerKey} onChange={(e) => setBillerKey(e.target.value)}>
            <option value="vic">VIC</option><option value="vr">VR Entertainment</option>
          </select></div>}
      </div>

      {mode === "invoice" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
            <div><span style={lbl}>Bill to (company)</span><input style={inp} value={company} onChange={(e) => setCompany(e.target.value)} /></div>
            <div><span style={lbl}>Client GST (optional)</span><input style={inp} value={gstin} onChange={(e) => setGstin(e.target.value)} /></div>
          </div>
          <div style={{ marginTop: 8 }}><span style={lbl}>Bill-to address</span><textarea style={{ ...inp, minHeight: 48, resize: "vertical" }} value={address} onChange={(e) => setAddress(e.target.value)} /></div>
          <div style={{ marginTop: 8 }}><span style={lbl}>Line description</span><input style={inp} value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
          <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 8, marginTop: 8, alignItems: "end" }}>
            <div><span style={lbl}>Terms (days)</span><input type="number" style={inp} value={terms} onChange={(e) => setTerms(e.target.value)} /></div>
            <div style={{ fontSize: ".78rem", color: "rgba(255,255,255,.6)", paddingBottom: 6 }}>Fee {rupee(total)} · Paid {rupee(paid)} · <strong style={{ color: "#ffb3b3" }}>Due {rupee(total - paid)}</strong></div>
          </div>
          {total <= 0 && <p style={{ fontSize: ".72rem", color: "#ffb3b3", margin: "6px 0 0" }}>Set the gig Fee above first — the invoice total is ₹0.</p>}

          {billers && (
            <div style={{ marginTop: 10 }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button className="btn sm" onClick={() => setShowPreview((v) => !v)}>{showPreview ? <><EyeOff size={12} /> Hide preview</> : <><Eye size={12} /> Preview invoice</>}</button>
                <button className="btn sm" onClick={downloadInvoice} disabled={busy}>{busy ? <Loader2 size={12} className="spin" /> : <Download size={12} />} Download</button>
                <button className="btn sm" onClick={whatsappInvoice} disabled={busy}><MessageCircle size={12} /> Download + WhatsApp</button>
              </div>
              {showPreview && (
                <div style={{ marginTop: 8, maxHeight: 420, overflow: "auto", borderRadius: 6, border: "1px solid var(--line)" }}>
                  <div style={{ transform: "scale(0.62)", transformOrigin: "top left", width: "161%" }} dangerouslySetInnerHTML={{ __html: invHTML }} />
                </div>
              )}
            </div>
          )}
        </>
      )}

      <button className="btn" style={{ marginTop: 12 }} onClick={send} disabled={busy || !isEmail(email) || (mode === "invoice" && !biller)}>
        {busy ? <Loader2 size={15} className="spin" /> : <Send size={15} />} Send {mode === "invoice" ? "invoice" : mode} to client
      </button>
    </div>
  );
}

// ============================================================
// EVENTS + GUEST CRM
// event_rsvps holds every RSVP (tagged by event slug). The `events`
// table is the registry. Contacts = event_rsvps deduped by phone.
// ============================================================
const glStat = { flex: 1, background: "#111", border: "1px solid rgba(201,168,76,0.18)", borderRadius: 8, padding: "0.9rem 1rem", textAlign: "center" };
const glNum = { display: "block", fontFamily: "'Bebas Neue',sans-serif", fontSize: "2rem", color: "#c9a84c", lineHeight: 1 };
const glLbl = { fontSize: "0.62rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.5)" };
const liveTag = { background: "#16331f", color: "#7fe0a0", borderColor: "#225436" };

function phoneKey(p) {
  let n = (p || "").replace(/\D/g, "");
  if (n.length === 10) n = "91" + n;   // assume India if 10 digits
  return n;
}
function slugify(s) { return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
// Derive display label + RSVP cutoff (6 PM) + popup expiry (next day 1 AM), all IST, from a YYYY-MM-DD event date.
function deriveTimes(dateStr) {
  const date_label = new Date(dateStr + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const rsvp_cutoff = `${dateStr}T18:00:00+05:30`;
  const next = new Date(new Date(dateStr + "T00:00:00+05:30").getTime() + 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const expiry = `${next}T01:00:00+05:30`;
  return { date_label, rsvp_cutoff, expiry };
}

function Field({ label, children }) {
  return (
    <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, fontSize: ".68rem", letterSpacing: ".06em", textTransform: "uppercase", color: "rgba(255,255,255,.5)" }}>
      {label}{children}
    </label>
  );
}

// ── Events tab: list + manage events, drill into per-event guest list / invites ──
function EventsAdmin({ showToast }) {
  const [events, setEvents] = useState([]); const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // event | "new" | null
  const [viewing, setViewing] = useState(null); // event whose detail is open
  const [mediaFor, setMediaFor] = useState(null); // event whose photos/videos manager is open
  const [recurFor, setRecurFor] = useState(null); // event id being re-scheduled
  const [recurDate, setRecurDate] = useState(""); const [recurBusy, setRecurBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("events").select("*").order("expiry", { ascending: false, nullsFirst: false });
    if (error) showToast("Couldn't load events — is events.sql run?");
    setEvents(data || []); setLoading(false);
  }, [showToast]);
  useEffect(() => { load(); }, [load]);

  const setLive = async (ev, live) => {
    if (live) await supabase.from("events").update({ active: false }).neq("id", ev.id);
    const { error } = await supabase.from("events").update({ active: live }).eq("id", ev.id);
    if (error) return showToast(error.message);
    showToast(live ? "Now live on the homepage." : "Taken off the homepage."); load();
  };
  const toggleGl = async (ev) => {
    await supabase.from("events").update({ guestlist_enabled: !ev.guestlist_enabled }).eq("id", ev.id); load();
  };

  // Recurring: clone this event to the next date, set it live with RSVP on,
  // log it as a gig + push to Google Calendar, then open its re-invite screen.
  const createNext = async (ev) => {
    if (!recurDate) return showToast("Pick the next date first");
    setRecurBusy(true);
    try {
      const times = deriveTimes(recurDate);
      const { data: newEv, error } = await supabase.from("events").insert({
        slug: slugify(ev.title) + "-" + recurDate, title: ev.title, venue: ev.venue, area: ev.area,
        time_label: ev.time_label, lineup: ev.lineup, genre: ev.genre, banner_url: ev.banner_url,
        ...times, guestlist_enabled: true, active: true,
      }).select().single();
      if (error) { setRecurBusy(false); return showToast(/duplicate|unique/i.test(error.message) ? "An event for that date already exists." : error.message); }
      await supabase.from("events").update({ active: false }).neq("id", newEv.id); // one live popup at a time
      // log as a gig + push to Google Calendar (graceful if calendar sync fails)
      let calNote = "";
      const { data: bk } = await supabase.from("bookings").insert({
        name: ev.title, contact: "—", event_type: "nightlife", event_date: recurDate,
        venue: ev.venue, city: ev.area, source: "manual", status: "accepted",
      }).select().single();
      if (bk?.id) {
        const cal = await fetch(`${FN}/calendar-sync?action=confirm`, {
          method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) },
          body: JSON.stringify({ bookingId: bk.id }),
        }).then((r) => r.json()).catch(() => ({ error: "network" }));
        calNote = cal?.error ? ` — calendar didn't sync; use "Sync to calendar" in Bookings` : " · on your calendar";
      }
      setRecurBusy(false); setRecurFor(null); setRecurDate("");
      showToast(`Next ${ev.title} is live${calNote}.`);
      setViewing({ ...newEv, _tab: "invite" }); // drop into re-invite screen
    } catch (e) { setRecurBusy(false); showToast(String(e.message || e)); }
  };

  if (editing) return <EventForm event={editing === "new" ? null : editing} onDone={() => { setEditing(null); load(); }} showToast={showToast} />;
  if (viewing) return <EventDetail event={viewing} onBack={() => { setViewing(null); load(); }} showToast={showToast} />;
  if (mediaFor) return <EventMediaManager event={mediaFor} onBack={() => setMediaFor(null)} showToast={showToast} />;

  const now = Date.now();
  const upcoming = events.filter((e) => !e.expiry || Date.parse(e.expiry) >= now);
  const past = events.filter((e) => e.expiry && Date.parse(e.expiry) < now);

  const card = (ev) => (
    <div key={ev.id} className="req">
      <div className="req-top">
        <div>
          <h3>{ev.title} {ev.active && <span className="tag" style={liveTag}>LIVE</span>}</h3>
          <p className="req-meta">
            <span>{ev.date_label || "—"}</span>
            {ev.venue && <span><MapPin size={12} /> {ev.venue}</span>}
            <span className="gold">{ev.guestlist_enabled ? "RSVP on" : "RSVP off"}</span>
          </p>
        </div>
      </div>
      <div className="req-actions">
        <button className="act" onClick={() => setViewing(ev)}><Users size={15} /> Guest list</button>
        <button className="act" onClick={() => setMediaFor(ev)}><Film size={15} /> Photos &amp; videos</button>
        <button className="act" onClick={() => setEditing(ev)}>Edit</button>
        <button className="act" onClick={() => toggleGl(ev)}>{ev.guestlist_enabled ? "Disable RSVP" : "Enable RSVP"}</button>
        <button className="act accept" onClick={() => { setRecurFor(recurFor === ev.id ? null : ev.id); setRecurDate(""); }}><CalendarDays size={15} /> Schedule next</button>
        <button className={ev.active ? "act decline" : "act"} onClick={() => setLive(ev, !ev.active)}>
          {ev.active ? "Take off site" : "Set live"}
        </button>
      </div>
      {recurFor === ev.id && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap", background: "rgba(201,168,76,0.06)", border: "1px solid rgba(201,168,76,0.2)", borderRadius: 8, padding: "8px 10px" }}>
          <span style={{ fontSize: ".72rem", color: "rgba(255,255,255,.65)" }}>Next <strong>{ev.title}</strong> on:</span>
          <input type="date" value={recurDate} onChange={(e) => setRecurDate(e.target.value)} style={{ background: "rgba(10,10,10,.6)", border: "1px solid var(--line)", borderRadius: 6, padding: "6px 9px", color: "var(--off)", fontSize: ".8rem", fontFamily: "Inter" }} />
          <button className="btn sm" onClick={() => createNext(ev)} disabled={recurBusy || !recurDate}>{recurBusy ? <Loader2 size={12} className="spin" /> : "Create + invite past guests →"}</button>
          <button className="btn sm ghost" onClick={() => setRecurFor(null)}>Cancel</button>
        </div>
      )}
    </div>
  );

  return (
    <>
      <div className="row-between">
        <h1 className="h1">Events</h1>
        <button className="btn sm" onClick={() => setEditing("new")}><Plus size={15} /> New event</button>
      </div>
      <p className="sub">Add an event and set it live to show the homepage guest-list popup. Open any event for its list + to invite past guests.</p>
      {loading ? <Center><Loader2 className="spin" size={18} /></Center> : (
        <>
          <p className="sub" style={{ margin: "2px 0 6px", color: "#c9a84c" }}>Live &amp; upcoming</p>
          <div className="list">
            {upcoming.length === 0 && <p className="empty">No upcoming events — add one.</p>}
            {upcoming.map(card)}
          </div>
          {past.length > 0 && (
            <>
              <p className="sub" style={{ margin: "20px 0 6px", color: "#c9a84c" }}>Past events</p>
              <div className="list">{past.map(card)}</div>
            </>
          )}
        </>
      )}
    </>
  );
}

function EventDetail({ event, onBack, showToast }) {
  const [tab, setTab] = useState(event._tab || "list");
  return (
    <>
      <button className="btn sm" onClick={onBack} style={{ marginBottom: 12 }}>← All events</button>
      <h1 className="h1">{event.title}</h1>
      <p className="sub">{event.date_label || "—"}{event.venue ? " · " + event.venue : ""}</p>
      <div className="chips">
        <button className={tab === "list" ? "chip on" : "chip"} onClick={() => setTab("list")}>Guest list</button>
        <button className={tab === "invite" ? "chip on" : "chip"} onClick={() => setTab("invite")}>Invite past guests</button>
      </div>
      {tab === "list"
        ? <EventGuests event={event} showToast={showToast} />
        : <InvitePastGuests event={event} showToast={showToast} />}
    </>
  );
}

function EventGuests({ event, showToast }) {
  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState(""); const [deleting, setDeleting] = useState(null);
  const [adding, setAdding] = useState(false); const [saving, setSaving] = useState(false);
  const [f, setF] = useState({ name: "", phone: "", guests: "1", entry: "", instagram: "" });

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("event_rsvps").select("*").eq("event", event.slug).order("created_at", { ascending: false });
    if (error) showToast("Couldn't load RSVPs.");
    setRows(data || []); setLoading(false);
  }, [event.slug, showToast]);
  useEffect(() => { load(); }, [load]);

  const waFor = (r) => {
    const n = phoneKey(r.phone);
    const msg = encodeURIComponent(`Hi ${r.name}! You're on the guest list for ${event.title}${event.venue ? " @ " + event.venue : ""}${event.date_label ? " (" + event.date_label + ")" : ""}. See you there — DJ VIC`);
    if (n.length >= 11) window.open(`https://wa.me/${n}?text=${msg}`, "_blank");
    else showToast("No valid phone for this RSVP.");
  };
  const del = async (id) => {
    if (!window.confirm("Remove this RSVP?")) return;
    setDeleting(id);
    const { error } = await supabase.from("event_rsvps").delete().eq("id", id);
    setDeleting(null);
    if (error) return showToast("Delete needs the admin delete grant (see event_rsvps.sql).");
    showToast("Removed."); load();
  };
  const addGuest = async () => {
    if (!f.name.trim()) return showToast("Enter a name.");
    setSaving(true);
    const { error } = await supabase.from("event_rsvps").insert({
      event: event.slug, name: f.name.trim(), phone: f.phone.trim() || "—",
      guests: parseInt(f.guests, 10) || 1, entry_type: f.entry || null,
      instagram: f.instagram.trim() || null, source: "manual",
    });
    setSaving(false);
    if (error) return showToast("Couldn't add — " + error.message);
    setF({ name: "", phone: "", guests: "1", entry: "", instagram: "" });
    setAdding(false); showToast("Added to the guest list."); load();
  };

  const q = query.trim().toLowerCase();
  const filtered = rows.filter((r) => !q || [r.name, r.phone, r.instagram, r.entry_type].some((v) => (v || "").toLowerCase().includes(q)));
  const heads = filtered.reduce((s, r) => s + (parseInt(r.guests, 10) || 1), 0);

  const exportCsv = () => {
    const cols = ["created_at", "name", "phone", "guests", "entry_type", "instagram", "source"];
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [cols.join(","), ...filtered.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${event.slug}-guestlist-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };
  const sendListToWhatsApp = () => {
    if (!filtered.length) return showToast("No RSVPs to send yet.");
    const sorted = [...filtered].sort((a, b) => (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" }));
    const lines = sorted.map((r) => `${r.name} - ${parseInt(r.guests, 10) || 1}`);
    const text = `*${event.title} Guest List*\n${event.date_label || ""} · ${filtered.length} RSVPs · ${heads} heads\n\n` + lines.join("\n");
    window.open(`https://wa.me/919611711677?text=${encodeURIComponent(text)}`, "_blank");
  };

  return (
    <>
      <div className="row-between">
        <p className="sub" style={{ margin: 0 }}>RSVPs from the guest-list form + manual adds.</p>
        <div style={{ display: "flex", gap: 8 }}>
          <button className={adding ? "btn sm" : "btn sm ghost"} onClick={() => setAdding((v) => !v)}><Plus size={15} /> Add guest</button>
          <button className="btn sm" onClick={sendListToWhatsApp}><MessageCircle size={15} /> WhatsApp list</button>
          <button className="btn sm" onClick={exportCsv}>Export CSV</button>
        </div>
      </div>

      {adding && (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8, margin: "12px 0 0" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input className="search" style={{ flex: "2 1 160px", margin: 0 }} placeholder="Name *" value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") addGuest(); }} />
            <input className="search" style={{ flex: "1 1 130px", margin: 0 }} placeholder="Phone / WhatsApp (optional)" value={f.phone}
              onChange={(e) => setF({ ...f, phone: e.target.value.replace(/[^\d+\s()-]/g, "") })} />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select className="search" style={{ flex: "1 1 90px", margin: 0 }} value={f.guests} onChange={(e) => setF({ ...f, guests: e.target.value })}>
              {["1", "2", "3", "4", "5", "6", "7", "8+"].map((n) => <option key={n} value={n}>{n} {n === "1" ? "guest" : "guests"}</option>)}
            </select>
            <select className="search" style={{ flex: "1 1 120px", margin: 0 }} value={f.entry} onChange={(e) => setF({ ...f, entry: e.target.value })}>
              <option value="">Entry —</option>
              <option value="couple">Couple</option>
              <option value="stag">Stag</option>
              <option value="mixed">Mixed group</option>
            </select>
            <input className="search" style={{ flex: "1 1 120px", margin: 0 }} placeholder="Instagram (optional)" value={f.instagram}
              onChange={(e) => setF({ ...f, instagram: e.target.value })} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn sm" disabled={saving || !f.name.trim()} onClick={addGuest}>{saving ? <Loader2 className="spin" size={14} /> : <Plus size={14} />} Add to list</button>
            <button className="btn sm ghost" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}
      <div style={{ display: "flex", gap: 10, margin: "12px 0 14px" }}>
        <div style={glStat}><strong style={glNum}>{filtered.length}</strong><span style={glLbl}>RSVPs</span></div>
        <div style={glStat}><strong style={glNum}>{heads}</strong><span style={glLbl}>Total heads</span></div>
      </div>
      <input className="search" placeholder="Search name, phone, instagram…" value={query} onChange={(e) => setQuery(e.target.value)} />
      {loading ? <Center><Loader2 className="spin" size={18} /></Center> : (
        <div className="list">
          {filtered.length === 0 && <p className="empty">No RSVPs yet.</p>}
          {filtered.map((r) => {
            const t = new Date(r.created_at);
            return (
              <div key={r.id} className="req">
                <div className="req-top">
                  <div>
                    <h3>{r.name} <span className="gold">· {r.guests} {Number(r.guests) === 1 ? "guest" : "guests"}</span>{r.source === "manual" && <span className="mini"> manual</span>}</h3>
                    <p className="req-meta">
                      {r.entry_type && <span className="tag">{r.entry_type}</span>}
                      <span>{r.phone}</span>
                      {r.instagram && <span>{r.instagram}</span>}
                      <span>{MONTHS[t.getMonth()]} {t.getDate()}, {pad(t.getHours())}:{pad(t.getMinutes())}</span>
                    </p>
                  </div>
                </div>
                <div className="req-actions">
                  <button className="act wa" onClick={() => waFor(r)}><MessageCircle size={15} /> WhatsApp</button>
                  <button className="act decline" disabled={deleting === r.id} onClick={() => del(r.id)}>
                    {deleting === r.id ? <Loader2 className="spin" size={15} /> : <Trash2 size={15} />} Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// Click-to-chat re-invite: every past guest NOT already on this event, one WhatsApp tap each.
function InvitePastGuests({ event, showToast }) {
  const [contacts, setContacts] = useState([]); const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState(""); const [, force] = useState(0);

  useEffect(() => {
    let on = true;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.from("event_rsvps").select("name,phone,instagram,event,created_at");
      if (error) showToast("Couldn't load past guests.");
      const rows = data || [];
      const onThis = new Set(rows.filter((r) => r.event === event.slug).map((r) => phoneKey(r.phone)));
      const byPhone = {};
      rows.forEach((r) => {
        const k = phoneKey(r.phone);
        if (!k || k.length < 11 || onThis.has(k)) return;
        if (!byPhone[k] || r.created_at > byPhone[k].last) byPhone[k] = { phone: k, name: r.name, instagram: r.instagram, last: r.created_at };
      });
      if (on) { setContacts(Object.values(byPhone)); setLoading(false); }
    })();
    return () => { on = false; };
  }, [event.slug, showToast]);

  const lsKey = `vic_invited_${event.slug}`;
  const messaged = () => { try { return JSON.parse(localStorage.getItem(lsKey) || "{}"); } catch { return {}; } };
  const invite = (c) => {
    const msg = encodeURIComponent(
      `Hi${c.name ? " " + c.name.split(" ")[0] : ""}! DJ VIC here 🎧 You came through for a previous night — we'd love to have you at *${event.title}*${event.venue ? " @ " + event.venue : ""}${event.date_label ? " on " + event.date_label : ""}. Want me to put you on the guest list?`
    );
    window.open(`https://wa.me/${c.phone}?text=${msg}`, "_blank");
    const m = messaged(); m[c.phone] = 1;
    try { localStorage.setItem(lsKey, JSON.stringify(m)); } catch {}
    force((x) => x + 1);
  };

  const q = query.trim().toLowerCase();
  const filtered = contacts.filter((c) => !q || [c.name, c.phone, c.instagram].some((v) => (v || "").toLowerCase().includes(q)));
  const sent = messaged();
  const sentCount = contacts.filter((c) => sent[c.phone]).length;

  return (
    <>
      <p className="sub">{contacts.length} past guests not yet on this list · {sentCount} messaged. One tap opens WhatsApp with the invite prefilled — you hit send.</p>
      <input className="search" placeholder="Search name, phone…" value={query} onChange={(e) => setQuery(e.target.value)} />
      {loading ? <Center><Loader2 className="spin" size={18} /></Center> : (
        <div className="list">
          {filtered.length === 0 && <p className="empty">No past guests to invite yet.</p>}
          {filtered.map((c) => (
            <div key={c.phone} className="req">
              <div className="req-top">
                <div>
                  <h3>{c.name || "Guest"} {sent[c.phone] && <span className="tag" style={liveTag}>messaged</span>}</h3>
                  <p className="req-meta"><span>+{c.phone}</span>{c.instagram && <span>{c.instagram}</span>}</p>
                </div>
              </div>
              <div className="req-actions">
                <button className="act wa" onClick={() => invite(c)}><MessageCircle size={15} /> Invite</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ── Guests tab: the master deduped contact database (CRM) ──
function Guests({ showToast }) {
  const [contacts, setContacts] = useState([]); const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let on = true;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.from("event_rsvps").select("name,phone,instagram,event,created_at").order("created_at", { ascending: false });
      if (error) showToast("Couldn't load guests.");
      const byPhone = {};
      (data || []).forEach((r) => {
        const k = phoneKey(r.phone);
        if (!k) return;
        if (!byPhone[k]) byPhone[k] = { phone: k, name: r.name, instagram: r.instagram, events: new Set(), visits: 0, last: r.created_at };
        const c = byPhone[k];
        c.events.add(r.event); c.visits += 1;
        if (r.created_at > c.last) { c.last = r.created_at; c.name = r.name || c.name; c.instagram = r.instagram || c.instagram; }
      });
      const list = Object.values(byPhone).map((c) => ({ ...c, eventsCount: c.events.size })).sort((a, b) => (b.last || "").localeCompare(a.last || ""));
      if (on) { setContacts(list); setLoading(false); }
    })();
    return () => { on = false; };
  }, [showToast]);

  const q = query.trim().toLowerCase();
  const filtered = contacts.filter((c) => !q || [c.name, c.phone, c.instagram].some((v) => (v || "").toLowerCase().includes(q)));
  const totalRsvps = filtered.reduce((s, c) => s + c.visits, 0);

  const exportCsv = () => {
    const head = ["name", "phone", "instagram", "events_attended", "total_rsvps", "last_seen"];
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [head.join(","), ...filtered.map((c) => [esc(c.name), esc("+" + c.phone), esc(c.instagram), c.eventsCount, c.visits, esc(c.last)].join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `djvic-guests-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };
  const waFor = (c) => window.open(`https://wa.me/${c.phone}?text=${encodeURIComponent(`Hi${c.name ? " " + c.name.split(" ")[0] : ""}! DJ VIC here 🎧`)}`, "_blank");

  return (
    <>
      <div className="row-between">
        <h1 className="h1">Guests</h1>
        <button className="btn sm" onClick={exportCsv}>Export CSV</button>
      </div>
      <p className="sub">Your master guest database — everyone who's ever RSVP'd, deduplicated by phone. Grows with every event.</p>
      <div style={{ display: "flex", gap: 10, margin: "0 0 14px" }}>
        <div style={glStat}><strong style={glNum}>{filtered.length}</strong><span style={glLbl}>Unique guests</span></div>
        <div style={glStat}><strong style={glNum}>{totalRsvps}</strong><span style={glLbl}>Total RSVPs</span></div>
      </div>
      <input className="search" placeholder="Search name, phone, instagram…" value={query} onChange={(e) => setQuery(e.target.value)} />
      {loading ? <Center><Loader2 className="spin" size={18} /></Center> : (
        <div className="list">
          {filtered.length === 0 && <p className="empty">No guests yet.</p>}
          {filtered.map((c) => {
            const t = new Date(c.last);
            return (
              <div key={c.phone} className="req">
                <div className="req-top">
                  <div>
                    <h3>{c.name || "Guest"} <span className="gold">· {c.eventsCount} {c.eventsCount === 1 ? "event" : "events"}</span></h3>
                    <p className="req-meta">
                      <span>+{c.phone}</span>
                      {c.instagram && <span>{c.instagram}</span>}
                      <span>{c.visits} RSVP{c.visits === 1 ? "" : "s"}</span>
                      <span>last {MONTHS[t.getMonth()]} {t.getDate()}</span>
                    </p>
                  </div>
                </div>
                <div className="req-actions">
                  <button className="act wa" onClick={() => waFor(c)}><MessageCircle size={15} /> WhatsApp</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ── Podcast tab: VIC Fix guest applications (from /thevicfix) ──
function PodcastApplications({ showToast }) {
  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState(""); const [deleting, setDeleting] = useState(null);
  const [open, setOpen] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("podcast_applications").select("*").order("created_at", { ascending: false });
    if (error) showToast("Couldn't load applications — is podcast_applications.sql run?");
    setRows(data || []); setLoading(false);
  }, [showToast]);
  useEffect(() => { load(); }, [load]);

  const reply = (r) => {
    if (r.phone && waDigits(r.phone).length >= 10) {
      let n = waDigits(r.phone); if (n.length === 10) n = "91" + n;
      window.open(`https://wa.me/${n}?text=${encodeURIComponent(`Hi ${r.name}, this is VIC — thanks for applying to The VIC Fix.`)}`, "_blank");
    } else if (r.email) {
      window.open(`mailto:${r.email}?subject=The VIC Fix&body=${encodeURIComponent(`Hi ${r.name}, thanks for applying to The VIC Fix.`)}`, "_blank");
    } else showToast("No contact on file for this application.");
  };
  const del = async (id) => {
    if (!window.confirm("Delete this application?")) return;
    setDeleting(id);
    const { error } = await supabase.from("podcast_applications").delete().eq("id", id);
    setDeleting(null);
    if (error) return showToast("Delete needs the admin grant (see podcast_applications.sql).");
    showToast("Deleted."); load();
  };

  const q = query.trim().toLowerCase();
  const filtered = rows.filter((r) => !q || [r.name, r.email, r.phone, r.instagram, r.role, r.story].some((v) => (v || "").toLowerCase().includes(q)));

  const exportCsv = () => {
    const cols = ["created_at", "name", "email", "phone", "instagram", "role", "story"];
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [cols.join(","), ...filtered.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `vicfix-applications-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <>
      <div className="row-between">
        <h1 className="h1">Podcast</h1>
        <button className="btn sm" onClick={exportCsv}>Export CSV</button>
      </div>
      <p className="sub">The VIC Fix guest applications — submitted from /thevicfix.</p>
      <input className="search" placeholder="Search name, role, story…" value={query} onChange={(e) => setQuery(e.target.value)} />
      {loading ? <Center><Loader2 className="spin" size={18} /></Center> : (
        <div className="list">
          {filtered.length === 0 && <p className="empty">No applications yet.</p>}
          {filtered.map((r) => {
            const t = new Date(r.created_at);
            const expanded = open === r.id;
            return (
              <div key={r.id} className="req">
                <div className="req-top">
                  <div>
                    <h3>{r.name} {r.role && <span className="tag">{r.role}</span>}</h3>
                    <p className="req-meta">
                      {r.email && <span>{r.email}</span>}
                      {r.phone && <span>{r.phone}</span>}
                      {r.instagram && <span>{r.instagram}</span>}
                      <span>{MONTHS[t.getMonth()]} {t.getDate()}</span>
                    </p>
                  </div>
                </div>
                {r.story && (
                  <p className="req-msg" style={expanded ? {} : { maxHeight: 58, overflow: "hidden" }}>{r.story}</p>
                )}
                {r.story && r.story.length > 160 && (
                  <button className="note-save" onClick={() => setOpen(expanded ? null : r.id)}>{expanded ? "Show less" : "Read more"}</button>
                )}
                <div className="req-actions">
                  <button className="act wa" onClick={() => reply(r)}><MessageCircle size={15} /> Reply</button>
                  <button className="act decline" disabled={deleting === r.id} onClick={() => del(r.id)}>
                    {deleting === r.id ? <Loader2 className="spin" size={15} /> : <Trash2 size={15} />} Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ── Podcast tab wrapper: Guest Pipeline + Applications ──
function Podcast({ showToast }) {
  const [sub, setSub] = useState("pipeline");
  const PC_TABS = [["pipeline", "Guest Pipeline", Film], ["applications", "Applications", Mic]];
  return (
    <div>
      <div className="nl-tabs">
        {PC_TABS.map(([k, label, Icon]) => (
          <button key={k} className={sub === k ? "nl-tab on" : "nl-tab"} onClick={() => setSub(k)}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>
      {sub === "pipeline" && <GuestPipeline showToast={showToast} />}
      {sub === "applications" && <PodcastApplications showToast={showToast} />}
    </div>
  );
}

// ── Add / edit a prospective guest ──
function GuestForm({ guest, onDone, showToast }) {
  const isEdit = !!guest; const init = guest || {};
  const [f, setF] = useState({
    name: init.name || "", industry: init.industry || "", instagram: init.instagram || "",
    shoot_date: init.shoot_date || "", release_date: init.release_date || "", status: init.status || "lead", notes: init.notes || "",
    ig_followers: init.ig_followers ?? null, ig_verified: init.ig_verified ?? null,
  });
  const [busy, setBusy] = useState(false); const [igBusy, setIgBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const fetchIg = async () => {
    if (!f.instagram.trim()) return showToast("Enter an Instagram handle first.");
    setIgBusy(true);
    const d = await fetchIgStats(f.instagram.trim());
    setIgBusy(false);
    if (d.error) return showToast(d.error);
    setF((s) => ({ ...s, ig_followers: d.followers, ig_verified: d.verified, instagram: d.username || s.instagram }));
    showToast(`@${d.username}: ${fmtFollowers(d.followers)} followers${d.verified ? " · verified" : ""}`);
  };

  const save = async () => {
    if (!f.name.trim()) return showToast("Name is required.");
    setBusy(true);
    const hasF = f.ig_followers != null && f.ig_followers !== "";
    const row = {
      name: f.name.trim(), industry: f.industry.trim() || null, instagram: f.instagram.trim() || null,
      shoot_date: f.shoot_date || null, release_date: f.release_date || null, status: f.status, notes: f.notes.trim() || null,
      ig_followers: hasF ? Number(f.ig_followers) : null, ig_verified: f.ig_verified ?? null,
      ig_checked_at: hasF ? new Date().toISOString() : (init.ig_checked_at || null),
    };
    const q = isEdit
      ? supabase.from("guest_pipeline").update(row).eq("id", guest.id)
      : supabase.from("guest_pipeline").insert(row);
    const { error } = await q;
    setBusy(false);
    if (error) return showToast("Save failed — is guest_pipeline.sql run? " + error.message);
    showToast(isEdit ? "Updated." : "Guest added."); onDone();
  };

  const tier = popTier(f.ig_followers);
  const ico = { width: 150, flex: "1 1 150px" };
  const relSundays = upcomingSundays(16);
  return (
    <div className="req" style={{ borderColor: "#c9a84c" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <input className="search" placeholder="Guest name *" value={f.name} onChange={(e) => set("name", e.target.value)} />
        <input className="search" placeholder="Industry (e.g. Nightlife, Comedy, Radio)" list="gp-industries" value={f.industry} onChange={(e) => set("industry", e.target.value)} />
        <datalist id="gp-industries">{INDUSTRIES.map((i) => <option key={i} value={i} />)}</datalist>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input className="search" style={{ flex: "2 1 200px" }} placeholder="Instagram handle" value={f.instagram} onChange={(e) => set("instagram", e.target.value)} />
          <button className="btn sm" disabled={igBusy} onClick={fetchIg}>{igBusy ? <Loader2 className="spin" size={14} /> : <AtSign size={14} />} Fetch followers</button>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input className="search" style={ico} type="number" placeholder="Followers" value={f.ig_followers ?? ""} onChange={(e) => set("ig_followers", e.target.value === "" ? null : e.target.value)} />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#cfcabf" }}>
            <input type="checkbox" checked={!!f.ig_verified} onChange={(e) => set("ig_verified", e.target.checked)} /> Verified
          </label>
          {tier && <span style={{ color: "#c9a84c", fontSize: 13 }}>{"★".repeat(tier.stars)}{"☆".repeat(5 - tier.stars)} {tier.label} · {fmtFollowers(f.ig_followers)}</span>}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <label style={{ ...ico, fontSize: 12, color: "#9a9a8a" }}>Shoot date (optional)<input type="date" className="search" value={f.shoot_date || ""} onChange={(e) => set("shoot_date", e.target.value)} /></label>
          <label style={{ ...ico, fontSize: 12, color: "#9a9a8a" }}>Release Sunday (optional)
            <select className="search" value={f.release_date || ""} onChange={(e) => set("release_date", e.target.value)}>
              <option value="">— TBD —</option>
              {f.release_date && !relSundays.includes(f.release_date) && <option value={f.release_date}>{fmtDate(f.release_date)}{isSunday(f.release_date) ? "" : " (not a Sunday)"}</option>}
              {relSundays.map((s) => <option key={s} value={s}>{fmtDate(s)}</option>)}
            </select>
          </label>
          <label style={{ ...ico, fontSize: 12, color: "#9a9a8a" }}>Status<select className="search" value={f.status} onChange={(e) => set("status", e.target.value)}>{STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        </div>
        <textarea className="search" rows={2} placeholder="Notes (optional)" value={f.notes} onChange={(e) => set("notes", e.target.value)} />
        <div className="req-actions">
          <button className="act wa" disabled={busy} onClick={save}>{busy ? <Loader2 className="spin" size={15} /> : <CheckCircle2 size={15} />} {isEdit ? "Save" : "Add guest"}</button>
          <button className="act" onClick={onDone}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── The VIC Fix · prospective guest tracker ──
function GuestPipeline({ showToast }) {
  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false); const [editing, setEditing] = useState(null);
  const [showArchived, setShowArchived] = useState(false); const [igBusyId, setIgBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("guest_pipeline").select("*")
      .order("release_date", { ascending: true, nullsFirst: false })
      .order("shoot_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) showToast("Couldn't load pipeline — is guest_pipeline.sql run?");
    setRows(data || []); setLoading(false);
  }, [showToast]);
  useEffect(() => { load(); }, [load]);

  const active = rows.filter((r) => !r.shot);
  const archived = rows.filter((r) => r.shot);
  const list = showArchived ? archived : active;

  // Release-Sunday planner: map every scheduled release (filmed or not) to its
  // Sunday so the strip shows who's premiering when, and which slots are open.
  const sundays = upcomingSundays(12);
  const byRelease = {};
  rows.forEach((r) => { if (r.release_date) (byRelease[r.release_date] = byRelease[r.release_date] || []).push(r); });

  const setStatus = async (r, status) => {
    const { error } = await supabase.from("guest_pipeline").update({ status }).eq("id", r.id);
    if (error) return showToast("Update failed.");
    setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, status } : x)));
  };
  const markShot = async (r) => {
    if (!window.confirm(`Mark "${r.name}" as shot? They move to the archive and drop off the active list.`)) return;
    const { error } = await supabase.from("guest_pipeline").update({ shot: true }).eq("id", r.id);
    if (error) return showToast("Update failed.");
    showToast(`${r.name} archived — shooting done.`); load();
  };
  const restore = async (r) => {
    const { error } = await supabase.from("guest_pipeline").update({ shot: false }).eq("id", r.id);
    if (error) return showToast("Update failed."); load();
  };
  const del = async (r) => {
    if (!window.confirm(`Delete "${r.name}" permanently?`)) return;
    const { error } = await supabase.from("guest_pipeline").delete().eq("id", r.id);
    if (error) return showToast("Delete failed."); load();
  };
  const refreshIg = async (r) => {
    if (!r.instagram) return showToast("No handle on file.");
    setIgBusyId(r.id);
    const d = await fetchIgStats(r.instagram);
    setIgBusyId(null);
    if (d.error) return showToast(d.error);
    const upd = { ig_followers: d.followers, ig_verified: d.verified, ig_checked_at: new Date().toISOString() };
    const { error } = await supabase.from("guest_pipeline").update(upd).eq("id", r.id);
    if (error) return showToast("Pulled IG but couldn't save.");
    setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, ...upd } : x)));
    showToast(`@${d.username || r.instagram}: ${fmtFollowers(d.followers)} followers`);
  };

  return (
    <>
      <div className="row-between">
        <h1 className="h1">Guest Pipeline</h1>
        {!adding && !editing && <button className="btn sm" onClick={() => setAdding(true)}><Plus size={14} /> Add guest</button>}
      </div>
      <p className="sub">Prospective VIC Fix guests — plan the shoot and the Sunday release. Mark a guest “shot” once filmed; they move to the archive and off the active list (still shown on the release calendar).</p>

      {adding && <GuestForm onDone={() => { setAdding(false); load(); }} showToast={showToast} />}
      {editing && <GuestForm guest={editing} onDone={() => { setEditing(null); load(); }} showToast={showToast} />}

      <style>{`
        .gp-wrap { overflow-x: auto; margin-top: 6px; }
        .gp-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
        .gp-table th { text-align: left; padding: 8px 10px; color: #8a8878; font-weight: 600; font-size: 10.5px; text-transform: uppercase; letter-spacing: .07em; border-bottom: 1px solid #2a2a2a; white-space: nowrap; }
        .gp-table td { padding: 9px 10px; border-bottom: 1px solid #1c1c1c; vertical-align: middle; }
        .gp-table tr:hover td { background: #141414; }
        .gp-name { font-weight: 600; color: #e8e8e0; }
        .gp-sub { color: #8a8878; font-size: 12px; }
        .gp-statussel { background: #161616; border: 1px solid #2a2a2a; border-radius: 6px; padding: 5px 8px; color: #e8e8e0; font-size: 12.5px; cursor: pointer; }
        .gp-actions-cell { white-space: nowrap; text-align: right; }
        .gp-ic { background: none; border: 1px solid #2a2a2a; border-radius: 6px; padding: 6px; color: #cfcabf; cursor: pointer; margin-left: 4px; line-height: 0; }
        .gp-ic:hover { border-color: #c9a84c; color: #c9a84c; }
        .gp-ic.danger:hover { border-color: #e0574a; color: #e0574a; }
        .gp-ic:disabled { opacity: .5; cursor: default; }
        @media (max-width: 720px) { .gp-table { min-width: 740px; } }
        .gp-sunwrap { margin: 6px 0 18px; }
        .gp-sunhead { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: #8a8878; font-weight: 600; margin-bottom: 8px; }
        .gp-suns { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 6px; }
        .gp-sun { flex: 0 0 116px; border: 1px solid #242424; border-radius: 8px; padding: 9px 10px; background: #131313; }
        .gp-sun.full { border-color: #c9a84c; background: linear-gradient(180deg, rgba(201,168,76,.08), transparent); }
        .gp-sun-d { display: flex; align-items: baseline; gap: 5px; }
        .gp-sun-d .m { font-size: 10.5px; text-transform: uppercase; letter-spacing: .08em; color: #8a8878; }
        .gp-sun-d .n { font-size: 19px; font-weight: 700; color: #e8e8e0; }
        .gp-sun-g { margin-top: 5px; font-size: 12px; color: #cfcabf; line-height: 1.35; }
        .gp-sun.full .gp-sun-g { color: #e6c768; }
      `}</style>

      {!showArchived && !loading && (
        <div className="gp-sunwrap">
          <div className="gp-sunhead">Release Sundays · hover a date for who &amp; what</div>
          <div className="gp-suns">
            {sundays.map((s) => {
              const gs = byRelease[s] || [];
              const d = new Date(s + "T00:00:00");
              const tip = gs.length ? gs.map((g) => `${g.name}${g.industry ? ` — ${g.industry}` : ""}${g.shot ? " (filmed)" : ""}`).join("\n") : "Open slot";
              return (
                <div key={s} className={gs.length ? "gp-sun full" : "gp-sun"} title={tip}>
                  <div className="gp-sun-d"><span className="m">{MONTHS[d.getMonth()]}</span><span className="n">{d.getDate()}</span></div>
                  <div className="gp-sun-g">{gs.length ? gs.map((g) => g.name).join(", ") : <span className="gp-sub">Open</span>}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {loading ? <Center><Loader2 className="spin" size={18} /></Center> : list.length === 0 ? (
        <p className="empty">{showArchived ? "No archived guests yet." : "No guests in the pipeline yet."}</p>
      ) : (
        <div className="gp-wrap">
          <table className="gp-table">
            <thead><tr><th>Guest</th><th>Instagram</th><th>Shoot</th><th>Release</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {list.map((r) => {
                const tier = popTier(r.ig_followers);
                const ig = (r.instagram || "").replace(/^@/, "");
                return (
                  <tr key={r.id} style={r.shot ? { opacity: 0.6 } : {}} title={r.notes || ""}>
                    <td>
                      <div className="gp-name">{r.name}</div>
                      {r.industry && <div className="gp-sub">{r.industry}</div>}
                    </td>
                    <td>
                      {ig ? (
                        <>
                          <div><a href={`https://instagram.com/${ig}`} target="_blank" rel="noopener noreferrer" style={{ color: "#cfcabf" }}>@{ig}</a>{r.ig_verified ? " ✓" : ""}</div>
                          {r.ig_followers != null
                            ? <div className="gp-sub" style={{ color: "#c9a84c" }}>{fmtFollowers(r.ig_followers)}{tier ? ` · ${tier.label}` : ""}</div>
                            : <div className="gp-sub">no count yet</div>}
                        </>
                      ) : <span className="gp-sub">—</span>}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>{r.shoot_date ? fmtDate(r.shoot_date) : <span className="gp-sub">TBD</span>}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{r.release_date ? <span style={{ color: "#c9a84c" }}>{fmtDate(r.release_date)}</span> : <span className="gp-sub">TBD</span>}</td>
                    <td>
                      {!r.shot
                        ? <select className="gp-statussel" style={{ borderLeft: `3px solid ${STATUS_COLOR[r.status] || "#9a9a8a"}` }} value={r.status} onChange={(e) => setStatus(r, e.target.value)}>{STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                        : <span className="gp-sub">shot</span>}
                    </td>
                    <td className="gp-actions-cell">
                      {!r.shot ? (
                        <>
                          {ig && <button className="gp-ic" title="Refresh followers" disabled={igBusyId === r.id} onClick={() => refreshIg(r)}>{igBusyId === r.id ? <Loader2 className="spin" size={14} /> : <RefreshCw size={14} />}</button>}
                          <button className="gp-ic" title="Edit" onClick={() => setEditing(r)}><Pencil size={14} /></button>
                          <button className="gp-ic" title="Mark shot (filmed)" onClick={() => markShot(r)}><Film size={14} /></button>
                          <button className="gp-ic danger" title="Delete" onClick={() => del(r)}><Trash2 size={14} /></button>
                        </>
                      ) : (
                        <>
                          <button className="gp-ic" title="Restore to pipeline" onClick={() => restore(r)}><RefreshCw size={14} /></button>
                          <button className="gp-ic danger" title="Delete" onClick={() => del(r)}><Trash2 size={14} /></button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {(active.length > 0 || archived.length > 0) && (
        <button className="note-save" style={{ marginTop: 12 }} onClick={() => setShowArchived((s) => !s)}>
          {showArchived ? `← Back to active pipeline (${active.length})` : `View archived / shot (${archived.length})`}
        </button>
      )}
    </>
  );
}

// ── Mail tab: read-only bookings@ inbox via Gmail (existing Google login) ──
function MailTab({ showToast }) {
  const [items, setItems] = useState([]); const [loading, setLoading] = useState(true);
  const [needScope, setNeedScope] = useState(false); const [err, setErr] = useState(null);
  const [query, setQuery] = useState(""); const [q, setQ] = useState("");
  const [openT, setOpenT] = useState(null); const [tLoading, setTLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr(null); setNeedScope(false);
    const d = await mailApi(q ? { action: "list", q } : { action: "list" });
    setLoading(false);
    if (d.needScope) { setNeedScope(true); return; }
    if (d.error) { setErr(d.error); return; }
    setItems(d.items || []);
  }, [q]);
  useEffect(() => { load(); }, [load]);

  const openThread = async (it) => {
    setTLoading(true); setOpenT({ threadId: it.threadId, subject: it.subject, messages: null });
    const d = await mailApi({ action: "thread", id: it.threadId });
    setTLoading(false);
    if (d.error) { showToast(d.error); setOpenT(null); return; }
    setOpenT({ threadId: it.threadId, subject: it.subject, messages: d.messages || [] });
  };
  const gmailUrl = (threadId) => `https://mail.google.com/mail/u/0/#all/${threadId}`;

  // ── Thread view ──
  if (openT) {
    return (
      <>
        <div className="row-between">
          <button className="note-save" onClick={() => setOpenT(null)}>← Back to inbox</button>
          <a className="btn sm" href={gmailUrl(openT.threadId)} target="_blank" rel="noopener noreferrer">Open in Gmail ↗</a>
        </div>
        <h1 className="h1" style={{ marginTop: 10 }}>{openT.subject || "(no subject)"}</h1>
        {tLoading || !openT.messages ? <Center><Loader2 className="spin" size={18} /></Center> : (
          <div className="list">
            {openT.messages.map((m) => (
              <div key={m.id} className="req">
                <div className="req-top">
                  <div>
                    <h3 style={{ fontSize: 15 }}>{mailName(m.from)}</h3>
                    <p className="req-meta"><span>{m.from}</span>{m.to && <span>→ {m.to}</span>}</p>
                  </div>
                  <span className="req-meta" style={{ whiteSpace: "nowrap" }}>{m.date && new Date(m.date).toLocaleString()}</span>
                </div>
                <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "inherit", fontSize: 13.5, lineHeight: 1.5, margin: "6px 0 0", color: "#d6d2c6" }}>{m.body || "(no text content)"}</pre>
              </div>
            ))}
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <div className="row-between">
        <h1 className="h1">Mail</h1>
        <button className="btn sm" onClick={load} disabled={loading}>{loading ? <Loader2 className="spin" size={14} /> : <RefreshCw size={14} />} Refresh</button>
      </div>
      <p className="sub">Everything to and from <b>bookings@djvicofficial.com</b>, read from your Google inbox.</p>

      {needScope ? (
        <div className="req" style={{ borderColor: "#e0b13c" }}>
          <h3>One quick setup step</h3>
          <p className="req-msg">The Mail tab reads your inbox through your existing Google login, but that login doesn't have <b>read-only Gmail</b> permission yet. Re-mint the Google refresh token with the <code>gmail.readonly</code> scope added (keep the existing Calendar / Analytics / Search Console scopes), then update <code>GOOGLE_REFRESH_TOKEN</code>. Ping me and I'll walk you through the exact 5-minute steps — same process as when we set up Search Console.</p>
        </div>
      ) : (
        <>
          <form onSubmit={(e) => { e.preventDefault(); setQ(query.trim()); }} style={{ display: "flex", gap: 8 }}>
            <input className="search" placeholder="Search this inbox (name, subject, word)…" value={query} onChange={(e) => setQuery(e.target.value)} />
            {q && <button type="button" className="btn sm" onClick={() => { setQuery(""); setQ(""); }}>Clear</button>}
          </form>
          {err ? <p className="empty">{err}</p> : loading ? <Center><Loader2 className="spin" size={18} /></Center> : (
            <div className="list">
              {items.length === 0 && <p className="empty">No mail found{q ? " for that search." : "."}</p>}
              {items.map((m) => (
                <button key={m.id} className="req" style={{ textAlign: "left", width: "100%", cursor: "pointer", borderLeft: m.unread ? "3px solid #c9a84c" : "3px solid transparent" }} onClick={() => openThread(m)}>
                  <div className="req-top">
                    <div>
                      <h3 style={{ fontSize: 15, fontWeight: m.unread ? 700 : 500 }}>{mailName(m.from)} {m.unread && <span className="tag" style={{ background: "#c9a84c", color: "#161616" }}>New</span>}</h3>
                      <p className="req-meta" style={{ color: "#cfcabf", fontWeight: m.unread ? 600 : 400 }}>{m.subject || "(no subject)"}</p>
                    </div>
                    <span className="req-meta" style={{ whiteSpace: "nowrap" }}>{mailDate(m.date)}</span>
                  </div>
                  <p className="req-msg" style={{ maxHeight: 40, overflow: "hidden", opacity: 0.8 }}>{m.snippet}</p>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

// Small labelled horizontal-bar list for a categorical breakdown.
function MiniBars({ title, rows, sub }) {
  if (!rows || !rows.length) return null;
  const top = Math.max(...rows.map((r) => r.count), 1);
  return (
    <div className="dca-bd">
      <div className="dca-bd-h"><span>{title}</span>{sub && <span className="dca-bd-sub">{sub}</span>}</div>
      {rows.map((r) => (
        <div className="dca-bd-row" key={r.label}>
          <span className="dca-bd-label" title={r.label}>{r.label}</span>
          <span className="dca-bd-bar"><span style={{ width: `${Math.round((r.count / top) * 100)}%` }} /></span>
          <span className="dca-bd-val">{r.count}</span>
        </div>
      ))}
    </div>
  );
}

// ── Feedback from the /feedback QR page (event_feedback) ──
// Rendered as a sub-tab inside the Collective view. Moderation: approve /
// reject, plus a silent ban that rejects the row AND blocks that
// device/network from ever surfacing again (they still see "Got it.").
function CollectiveFeedback({ showToast }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("pending");
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("event_feedback").select("*").order("created_at", { ascending: false });
    if (error) showToast("Couldn't load feedback — run supabase/vicfix_feedback_admin.sql (admin read policy).");
    setRows(data || []); setLoading(false);
  }, [showToast]);
  useEffect(() => { load(); }, [load]);

  const moderate = async (r, s) => {
    setBusy(r.id);
    const { error } = await supabase.from("event_feedback").update({ status: s }).eq("id", r.id);
    setBusy(null);
    if (error) return showToast("Update failed — " + error.message);
    showToast(s === "approved" ? "Approved." : s === "rejected" ? "Rejected." : "Moved to pending.");
    setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, status: s } : x)));
  };

  const ban = async (r) => {
    if (!(r.fingerprint || r.ip_hash)) return showToast("Nothing to ban here — no device/network signal on this row.");
    if (!window.confirm("Silently ban this device/network?\n\nTheir future submissions are auto-rejected and never surface — they still see “Got it.” This row will be rejected too.")) return;
    setBusy(r.id);
    const { error: be } = await supabase.from("banned_identifiers").insert({ fingerprint: r.fingerprint || null, ip_hash: r.ip_hash || null, reason: "banned from admin" });
    if (be) { setBusy(null); return showToast("Ban failed — " + be.message); }
    await supabase.from("event_feedback").update({ status: "rejected" }).eq("id", r.id);
    setBusy(null);
    showToast("Banned + rejected.");
    setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, status: "rejected" } : x)));
  };

  const counts = {
    pending: rows.filter((r) => r.status === "pending").length,
    approved: rows.filter((r) => r.status === "approved").length,
    rejected: rows.filter((r) => r.status === "rejected").length,
    all: rows.length,
  };
  const filtered = status === "all" ? rows : rows.filter((r) => r.status === status);
  const fmtWhen = (s) => { const d = new Date(s); return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
  const catColor = { feedback: "#c9a84c", idea: "#4CAF87", question: "#5aa9e6", other: "#8a8878" };

  return (
    <div className="cfb">
      <style>{`
        .cfb-card { background:#111; border:1px solid #1e1e1e; border-radius:12px; padding:14px 16px; margin-bottom:10px; }
        .cfb-card.flagged { border-color:#5a2b2b; }
        .cfb-head { display:flex; align-items:center; gap:10px; margin-bottom:8px; flex-wrap:wrap; }
        .cfb-cat { font-size:11px; letter-spacing:.1em; text-transform:uppercase; font-weight:700; padding:3px 9px; border-radius:100px; }
        .cfb-flag { font-size:11px; color:#e08a8a; display:inline-flex; align-items:center; gap:4px; }
        .cfb-when { font-size:12px; color:#6b6a5f; margin-left:auto; white-space:nowrap; }
        .cfb-msg { font-size:15px; line-height:1.6; color:#e8e4d8; white-space:pre-wrap; word-break:break-word; }
        .cfb-acts { display:flex; gap:8px; margin-top:12px; flex-wrap:wrap; }
        .cfb-badge { font-size:11px; padding:2px 8px; border-radius:100px; text-transform:uppercase; letter-spacing:.08em; }
        .cfb-badge.approved { background:rgba(76,175,135,.14); color:#7fe0a0; }
        .cfb-badge.rejected { background:rgba(255,80,80,.12); color:#e89090; }
      `}</style>

      <p className="sub">Anonymous feedback &amp; questions from the <code>/feedback</code> QR page. Nothing here is public — approve only what you want to keep.</p>

      <div className="chips" style={{ alignItems: "center" }}>
        {[["pending", "Pending"], ["approved", "Approved"], ["rejected", "Rejected"], ["all", "All"]].map(([k, label]) => (
          <button key={k} className={status === k ? "chip on" : "chip"} onClick={() => setStatus(k)}>{label} ({counts[k]})</button>
        ))}
        <button className="btn sm ghost" style={{ marginLeft: "auto" }} onClick={load}><RefreshCw size={14} /> Refresh</button>
      </div>

      {loading ? <Center><Loader2 className="spin" size={18} /></Center> : filtered.length === 0 ? (
        <p className="empty"><Inbox size={16} style={{ verticalAlign: "-3px", marginRight: 6 }} />No {status === "all" ? "" : status + " "}feedback{status === "pending" ? " — you're all caught up" : ""}.</p>
      ) : filtered.map((r) => (
        <div key={r.id} className={r.flagged ? "cfb-card flagged" : "cfb-card"}>
          <div className="cfb-head">
            <span className="cfb-cat" style={{ background: (catColor[r.category] || "#8a8878") + "22", color: catColor[r.category] || "#8a8878" }}>{r.category}</span>
            {r.status !== "pending" && <span className={`cfb-badge ${r.status}`}>{r.status}</span>}
            {r.flagged && <span className="cfb-flag"><Ban size={12} /> {r.flag_reason || "flagged"}</span>}
            <span className="cfb-when">{fmtWhen(r.created_at)}</span>
          </div>
          <div className="cfb-msg">{r.message}</div>
          <div className="cfb-acts">
            {r.status !== "approved" && <button className="btn sm" onClick={() => moderate(r, "approved")} disabled={busy === r.id}>{busy === r.id ? <Loader2 size={14} className="spin" /> : <CheckCircle2 size={14} />} Approve</button>}
            {r.status !== "rejected" && <button className="btn sm ghost" onClick={() => moderate(r, "rejected")} disabled={busy === r.id}><XCircle size={14} /> Reject</button>}
            {r.status === "rejected" && <button className="btn sm ghost" onClick={() => moderate(r, "pending")} disabled={busy === r.id}><Clock size={14} /> Restore</button>}
            <button className="btn sm ghost" style={{ color: "#e08a8a", borderColor: "#5a2b2b" }} onClick={() => ban(r)} disabled={busy === r.id} title="Silently ban this device/network"><Ban size={14} /> Ban</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── The DJ Collective (Bengaluru) — RSVP counts + attendee list ──
function DJCollective({ showToast }) {
  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(true);
  const [sess, setSess] = useState("all"); const [query, setQuery] = useState("");
  const [editRow, setEditRow] = useState(null); const [sort, setSort] = useState("new");
  const [view, setView] = useState("cards"); const [showStats, setShowStats] = useState(false);
  const [genreFilter, setGenreFilter] = useState("all");
  const [panel, setPanel] = useState("rsvps"); // "rsvps" | "feedback" sub-tab

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("dj_collective_rsvps").select("*").order("created_at", { ascending: false });
    if (error) showToast("Couldn't load RSVPs — run dj_collective_rsvps.sql (incl. the admin select policy).");
    setRows(data || []); setLoading(false);
  }, [showToast]);
  useEffect(() => { load(); }, [load]);

  const del = async (r) => {
    if (!window.confirm(`Remove ${r.name}'s RSVP?`)) return;
    const { error } = await supabase.from("dj_collective_rsvps").delete().eq("id", r.id);
    if (error) return showToast("Delete failed — " + error.message);
    showToast("Removed."); load();
  };

  const sessions = [...new Set(rows.map((r) => r.session || "—"))];
  const genreOf = (r) => (r.genre || "").split(",").map((s) => s.trim()).filter(Boolean);
  // Every distinct genre across all RSVPs (case-insensitive), for the filter.
  const allGenres = (() => {
    const m = new Map();
    rows.forEach((r) => genreOf(r).forEach((g) => { if (!m.has(g.toLowerCase())) m.set(g.toLowerCase(), g); }));
    return [...m.values()].sort((a, b) => a.localeCompare(b));
  })();
  const q = query.trim().toLowerCase();
  const filtered = rows
    .filter((r) => sess === "all" || (r.session || "—") === sess)
    .filter((r) => genreFilter === "all" || genreOf(r).some((g) => g.toLowerCase() === genreFilter.toLowerCase()))
    .filter((r) => !q || [r.name, r.dj_name, r.genre, r.instagram, r.phone].some((v) => (v || "").toLowerCase().includes(q)));
  const sorted = [...filtered].sort((a, b) => {
    if (sort === "old") return new Date(a.created_at) - new Date(b.created_at);
    if (sort === "name") return (a.name || "").localeCompare(b.name || "");
    if (sort === "dj") return (a.dj_name || a.name || "").localeCompare(b.dj_name || b.name || "");
    if (sort === "genre") return (a.genre || "~").localeCompare(b.genre || "~") || (a.name || "").localeCompare(b.name || "");
    return new Date(b.created_at) - new Date(a.created_at); // "new" (default)
  });

  const waLink = (p) => { let n = waDigits(p); if (n.length === 10) n = "91" + n; return n.length >= 10 ? `https://wa.me/${n}` : null; };
  const fmtWhen = (s) => { const d = new Date(s); return `${MONTHS[d.getMonth()]} ${d.getDate()}`; };

  // Signups-by-date for the selected edition: per-day new RSVPs + the running
  // "collective number" (cumulative total). Search query is intentionally
  // ignored — this is a momentum view, not a filtered slice.
  const series = useMemo(() => {
    const base = rows.filter((r) => sess === "all" || (r.session || "—") === sess);
    const byDay = {};
    base.forEach((r) => { const k = new Date(r.created_at).toLocaleDateString("en-CA"); byDay[k] = (byDay[k] || 0) + 1; });
    let cum = 0;
    return Object.keys(byDay).sort().map((k) => {
      cum += byDay[k];
      const d = new Date(k + "T00:00:00");
      return { label: `${MONTHS[d.getMonth()]} ${d.getDate()}`, count: byDay[k], total: cum };
    });
  }, [rows, sess]);

  // Categorical breakdowns for the selected edition: genre mix, experience
  // spread, and how reachable the list is (IG handle / valid WhatsApp number).
  const stats = useMemo(() => {
    const base = rows.filter((r) => sess === "all" || (r.session || "—") === sess);
    const n = base.length;
    const gmap = {};
    base.forEach((r) => {
      (r.genre || "").split(",").forEach((part) => {
        const raw = part.trim(); if (!raw) return;
        const key = raw.toLowerCase();
        (gmap[key] || (gmap[key] = { label: raw, count: 0 })).count++;
      });
    });
    const genres = Object.values(gmap).sort((a, b) => b.count - a.count);
    const yorder = ["Under 2 years", "2-5 years", "5-10 years", "10-15 years", "15+ years"];
    const ymap = {};
    base.forEach((r) => { const y = (r.years || "").trim(); if (y) ymap[y] = (ymap[y] || 0) + 1; });
    const years = [...yorder.filter((y) => ymap[y]), ...Object.keys(ymap).filter((y) => !yorder.includes(y))]
      .map((y) => ({ label: y, count: ymap[y] }));
    const withIg = base.filter((r) => (r.instagram || "").trim()).length;
    const withPhone = base.filter((r) => waDigits(r.phone || "").length >= 10).length;
    const weekAgo = Date.now() - 7 * 864e5;
    const thisWeek = base.filter((r) => new Date(r.created_at).getTime() >= weekAgo).length;
    return { n, genres, years, withIg, withPhone, thisWeek };
  }, [rows, sess]);
  const pctOf = (a) => (stats.n ? `${Math.round((a / stats.n) * 100)}% of edition` : "—");

  const exportCsv = () => {
    const cols = ["created_at", "session", "name", "dj_name", "genre", "years", "instagram", "phone"];
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [cols.join(","), ...filtered.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `dj-collective-rsvps-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  // Clean check-in roster for the Watson's team: name + DJ name only (no phone),
  // sorted alphabetically, with two empty tick columns — "Checked In" (arrived)
  // and "In Jar" (name written & dropped in the lucky-dip jar). Real .xlsx via
  // SheetJS, dynamically imported so it never weighs down the admin's load.
  const [rosterBusy, setRosterBusy] = useState(false);
  const exportRoster = async () => {
    const list = [...filtered].sort((a, b) =>
      (a.name || a.dj_name || "").localeCompare(b.name || b.dj_name || ""));
    if (!list.length) return showToast("No RSVPs to export in this view.");
    setRosterBusy(true);
    try {
      const XLSX = await import("xlsx");
      const editionLabel = sess === "all" ? "All editions" : sess;
      const data = list.map((r, i) => ({
        "#": i + 1,
        "Name": r.name || "",
        "DJ Name": r.dj_name || "",
        "Checked In": "",
        "In Jar (Lucky Dip)": "",
      }));
      const ws = XLSX.utils.json_to_sheet(data, {
        header: ["#", "Name", "DJ Name", "Checked In", "In Jar (Lucky Dip)"],
      });
      ws["!cols"] = [{ wch: 4 }, { wch: 26 }, { wch: 22 }, { wch: 12 }, { wch: 18 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Roster");
      const stamp = new Date().toISOString().slice(0, 10);
      const safe = editionLabel.replace(/[^\w-]+/g, "_");
      XLSX.writeFile(wb, `dj-collective-roster-${safe}-${stamp}.xlsx`);
      showToast(`Roster exported — ${list.length} name${list.length === 1 ? "" : "s"}.`);
    } catch (e) {
      showToast("Excel export failed — " + (e?.message || "try again"));
    } finally {
      setRosterBusy(false);
    }
  };

  return (
    <>
      <style>{`
        .dca-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(255px, 1fr)); gap: 8px; margin-top: 10px; }
        .dca-card { background: #121214; border: 1px solid #232323; border-radius: 8px; padding: 11px 13px; }
        .dca-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
        .dca-name { font-weight: 600; color: #e8e8e0; font-size: 14px; line-height: 1.3; min-width: 0; }
        .dca-dj { color: #c9a84c; font-weight: 500; }
        .dca-acts { display: flex; gap: 4px; flex-shrink: 0; }
        .dca-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 3px 10px; margin-top: 6px; font-size: 12.5px; color: #8a8878; }
        .dca-meta a { color: #cfcabf; }
        .dca-meta .ph { color: #c9a84c; }
        .dca-when { margin-left: auto; color: #66665e; font-size: 11.5px; }
        .dca-ic { background: none; border: 1px solid #2a2a2a; border-radius: 6px; padding: 6px; color: #cfcabf; cursor: pointer; line-height: 0; }
        .dca-ic:hover { border-color: #c9a84c; color: #c9a84c; }
        .dca-ic.danger:hover { border-color: #e0574a; color: #e0574a; }
        .dca-vt { display: inline-flex; border: 1px solid #2a2a2a; border-radius: 7px; overflow: hidden; }
        .dca-vt button { background: none; border: 0; color: #8a8878; font-size: 12px; padding: 6px 13px; cursor: pointer; }
        .dca-vt button.on { background: #c9a84c; color: #161616; font-weight: 600; }
        .dca-chart { background: #121214; border: 1px solid #232323; border-radius: 8px; padding: 12px 12px 8px; margin: 10px 0 12px; }
        .dca-chart-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
        .dca-chart-head span:first-child { color: #8a8878; font-size: 10.5px; text-transform: uppercase; letter-spacing: .07em; font-weight: 600; }
        .dca-chart-cur { color: #c9a84c; font-weight: 700; font-size: 13px; }
        .dca-grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px; margin-bottom: 12px; }
        .dca-bd { background: #121214; border: 1px solid #232323; border-radius: 8px; padding: 12px 14px; }
        .dca-bd-h { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; margin-bottom: 9px; }
        .dca-bd-h > span:first-child { color: #8a8878; font-size: 10.5px; text-transform: uppercase; letter-spacing: .07em; font-weight: 600; }
        .dca-bd-sub { color: #66665e; font-size: 11px; }
        .dca-bd-row { display: flex; align-items: center; gap: 10px; padding: 4px 0; }
        .dca-bd-label { flex: 0 0 34%; min-width: 78px; color: #cfcabf; font-size: 12.5px; text-transform: capitalize; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dca-bd-bar { flex: 1; height: 8px; background: #1a1a1a; border-radius: 4px; overflow: hidden; }
        .dca-bd-bar > span { display: block; height: 100%; background: linear-gradient(90deg, #a8842f, #c9a84c); border-radius: 4px; }
        .dca-bd-val { flex: 0 0 auto; min-width: 28px; text-align: right; color: #e8e8e0; font-weight: 600; font-size: 12.5px; }
        .dca-wrap { overflow-x: auto; margin-top: 10px; }
        .dca-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
        .dca-table th { text-align: left; padding: 8px 10px; color: #8a8878; font-weight: 600; font-size: 10.5px; text-transform: uppercase; letter-spacing: .07em; border-bottom: 1px solid #2a2a2a; white-space: nowrap; }
        .dca-table td { padding: 10px; border-bottom: 1px solid #1c1c1c; vertical-align: middle; color: #cfcabf; }
        .dca-table tbody tr:hover td { background: #141414; }
        .dca-tname { font-weight: 600; color: #e8e8e0; }
        .dca-tact { white-space: nowrap; text-align: right; }
        @media (max-width: 720px) { .dca-table { min-width: 780px; } }
      `}</style>
      <div className="row-between">
        <h1 className="h1">The DJ Collective</h1>
        {panel === "rsvps" && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div className="dca-vt">
            <button className={view === "cards" ? "on" : ""} onClick={() => setView("cards")}>Cards</button>
            <button className={view === "table" ? "on" : ""} onClick={() => setView("table")}>Table</button>
          </div>
          <button className={showStats ? "btn sm" : "btn sm ghost"} onClick={() => setShowStats((v) => !v)}><TrendingUp size={15} /> Stats</button>
          <button className="btn sm ghost" onClick={exportCsv}>Export CSV</button>
          <button className="btn sm" onClick={exportRoster} disabled={rosterBusy} title="Name + DJ name only, with check-in & lucky-dip columns">
            {rosterBusy ? <Loader2 size={15} className="spin" /> : <Download size={15} />} Roster (Excel)
          </button>
        </div>
        )}
      </div>

      <div className="dca-vt" style={{ margin: "2px 0 14px" }}>
        <button className={panel === "rsvps" ? "on" : ""} onClick={() => setPanel("rsvps")}>RSVPs ({rows.length})</button>
        <button className={panel === "feedback" ? "on" : ""} onClick={() => setPanel("feedback")}>Feedback</button>
      </div>

      {panel === "feedback" ? <CollectiveFeedback showToast={showToast} /> : (
      <>
      <p className="sub">RSVPs for the Bengaluru DJ meetup{sess !== "all" ? ` — ${sess}` : ""}.</p>

      <div className="chips">
        <button className={sess === "all" ? "chip on" : "chip"} onClick={() => setSess("all")}>All ({rows.length})</button>
        {sessions.map((s) => (
          <button key={s} className={sess === s ? "chip on" : "chip"} onClick={() => setSess(s)}>{s} ({rows.filter((r) => (r.session || "—") === s).length})</button>
        ))}
      </div>

      {showStats && (
        <div className="dca-stats">
          <div className="cards" style={{ marginBottom: 10 }}>
            <Stat label="Total RSVPs" value={rows.length} hint="All editions" />
            <Stat label={sess === "all" ? "Across all" : "This edition"} value={stats.n} hint={sess === "all" ? "Everyone" : sess} />
            <Stat label="New · 7 days" value={stats.thisWeek} hint="Momentum" />
            <Stat label="With Instagram" value={stats.withIg} hint={pctOf(stats.withIg)} />
            <Stat label="Reachable" value={stats.withPhone} hint="Valid WhatsApp no." />
            <Stat label="Editions" value={sessions.length} hint="Distinct sessions" />
          </div>

          {series.length >= 2 && (
            <div className="dca-chart">
              <div className="dca-chart-head">
                <span>Signups by date</span>
                <span className="dca-chart-cur">{series[series.length - 1].total} DJs{sess !== "all" ? ` · ${sess}` : ""}</span>
              </div>
              <ResponsiveContainer width="100%" height={190}>
                <ComposedChart data={series} margin={{ top: 6, right: 6, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="#1e1e1e" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "#8a8878", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#2a2a2a" }} interval="preserveStartEnd" minTickGap={18} />
                  <YAxis allowDecimals={false} tick={{ fill: "#8a8878", fontSize: 11 }} tickLine={false} axisLine={false} width={30} />
                  <Tooltip contentStyle={{ background: "#161616", border: "1px solid #2a2a2a", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "#e8e8e0" }} itemStyle={{ padding: 0 }} formatter={(v, n) => [v, n === "total" ? "Collective total" : "New that day"]} />
                  <Bar dataKey="count" name="count" fill="#3a3320" radius={[3, 3, 0, 0]} barSize={14} />
                  <Line type="monotone" dataKey="total" name="total" stroke="#c9a84c" strokeWidth={2} dot={{ r: 2.5, fill: "#c9a84c", strokeWidth: 0 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {(stats.genres.length > 0 || stats.years.length > 0) && (
            <div className="dca-grid2">
              <MiniBars title="Top genres" rows={stats.genres.slice(0, 8)} sub={stats.genres.length > 8 ? `+${stats.genres.length - 8} more` : null} />
              <MiniBars title="Experience · years DJing" rows={stats.years} />
            </div>
          )}

          {series.length < 2 && stats.genres.length === 0 && stats.years.length === 0 && (
            <p className="empty" style={{ padding: "8px 2px" }}>Stats fill in as RSVPs come in.</p>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input className="search" style={{ flex: "1 1 200px", margin: 0 }} placeholder="Search name, DJ name, genre, IG…" value={query} onChange={(e) => setQuery(e.target.value)} />
        {allGenres.length > 0 && (
          <select className="search" style={{ width: "auto", margin: 0 }} value={genreFilter} onChange={(e) => setGenreFilter(e.target.value)} title="Filter by genre">
            <option value="all">All genres</option>
            {allGenres.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        )}
        <select className="search" style={{ width: "auto", margin: 0 }} value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="new">Newest first</option>
          <option value="old">Oldest first</option>
          <option value="name">Name A–Z</option>
          <option value="dj">DJ name A–Z</option>
          <option value="genre">Genre</option>
        </select>
      </div>
      {genreFilter !== "all" && (
        <p className="sub" style={{ margin: "6px 0 0" }}>Showing <strong style={{ color: "#c9a84c" }}>{genreFilter}</strong> DJs · {filtered.length} <button className="dca-ic" style={{ padding: "2px 8px", marginLeft: 6, fontSize: 12 }} onClick={() => setGenreFilter("all")}>clear</button></p>
      )}

      {editRow && <DJCEditForm row={editRow} onDone={() => { setEditRow(null); load(); }} onCancel={() => setEditRow(null)} showToast={showToast} />}

      {loading ? <Center><Loader2 className="spin" size={18} /></Center> : filtered.length === 0 ? (
        <p className="empty">No RSVPs yet.</p>
      ) : view === "table" ? (
        <div className="dca-wrap">
          <table className="dca-table">
            <thead><tr><th>Name</th><th>DJ name</th><th>Genre</th><th>Years</th><th>Instagram</th><th>Phone</th><th>When</th><th></th></tr></thead>
            <tbody>
              {sorted.map((r) => {
                const ig = (r.instagram || "").replace(/^@/, "");
                const wl = waLink(r.phone);
                return (
                  <tr key={r.id}>
                    <td className="dca-tname">{r.name}</td>
                    <td>{r.dj_name || "—"}</td>
                    <td>{r.genre || "—"}</td>
                    <td>{r.years || "—"}</td>
                    <td>{ig ? <a href={`https://instagram.com/${ig}`} target="_blank" rel="noopener noreferrer" style={{ color: "#cfcabf" }}>@{ig}</a> : "—"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{wl ? <a href={wl} target="_blank" rel="noopener noreferrer" style={{ color: "#c9a84c" }}>{r.phone}</a> : (r.phone || "—")}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{fmtWhen(r.created_at)}</td>
                    <td className="dca-tact">
                      <button className="dca-ic" title="Edit" onClick={() => setEditRow(r)}><Pencil size={14} /></button>
                      <button className="dca-ic danger" title="Remove" onClick={() => del(r)}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="dca-list">
          {sorted.map((r) => {
            const ig = (r.instagram || "").replace(/^@/, "");
            const wl = waLink(r.phone);
            const meta = [r.genre, r.years].filter(Boolean);
            return (
              <div key={r.id} className="dca-card">
                <div className="dca-top">
                  <div className="dca-name">{r.name}{r.dj_name ? <span className="dca-dj"> · {r.dj_name}</span> : ""}</div>
                  <div className="dca-acts">
                    <button className="dca-ic" title="Edit" onClick={() => setEditRow(r)}><Pencil size={14} /></button>
                    <button className="dca-ic danger" title="Remove" onClick={() => del(r)}><Trash2 size={14} /></button>
                  </div>
                </div>
                <div className="dca-meta">
                  {meta.length > 0 && <span>{meta.join(" · ")}</span>}
                  {ig && <a href={`https://instagram.com/${ig}`} target="_blank" rel="noopener noreferrer">@{ig}</a>}
                  {wl ? <a className="ph" href={wl} target="_blank" rel="noopener noreferrer">{r.phone}</a> : (r.phone && <span className="ph">{r.phone}</span>)}
                  <span className="dca-when">{fmtWhen(r.created_at)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      </>
      )}
    </>
  );
}

// ── Edit a single DJ Collective RSVP (fix typos etc.) ──
function DJCEditForm({ row, onDone, onCancel, showToast }) {
  const [f, setF] = useState({
    name: row.name || "", dj_name: row.dj_name || "", genre: row.genre || "",
    years: row.years || "", instagram: row.instagram || "", phone: row.phone || "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const save = async () => {
    if (!f.name.trim()) return showToast("Name is required.");
    if (!f.phone.trim()) return showToast("Phone is required.");
    setBusy(true);
    const { error } = await supabase.from("dj_collective_rsvps").update({
      name: f.name.trim(), dj_name: f.dj_name.trim() || null, genre: f.genre.trim() || null,
      years: f.years.trim() || null, instagram: f.instagram.trim() || null, phone: f.phone.trim(),
    }).eq("id", row.id);
    setBusy(false);
    if (error) return showToast("Save failed — " + error.message);
    showToast("RSVP updated."); onDone();
  };
  return (
    <div className="card entry" style={{ borderColor: "#c9a84c", marginBottom: 12 }}>
      <h3 style={{ margin: "0 0 10px", color: "#e8e8e0" }}>Edit RSVP</h3>
      <div className="grid2">
        <div className="field"><label>Name</label><input value={f.name} onChange={(e) => set("name", e.target.value)} /></div>
        <div className="field"><label>Phone (WhatsApp)</label><input value={f.phone} onChange={(e) => set("phone", e.target.value)} /></div>
        <div className="field"><label>DJ / artist name</label><input value={f.dj_name} onChange={(e) => set("dj_name", e.target.value)} /></div>
        <div className="field"><label>Genre</label><input value={f.genre} onChange={(e) => set("genre", e.target.value)} /></div>
        <div className="field"><label>Years in the scene</label><input value={f.years} onChange={(e) => set("years", e.target.value)} /></div>
        <div className="field"><label>Instagram</label><input value={f.instagram} onChange={(e) => set("instagram", e.target.value)} /></div>
      </div>
      <div className="req-actions">
        <button className="act wa" disabled={busy} onClick={save}>{busy ? <Loader2 className="spin" size={15} /> : <CheckCircle2 size={15} />} Save changes</button>
        <button className="act" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function EventForm({ event, onDone, showToast }) {
  const isEdit = !!event; const init = event || {};
  const [f, setF] = useState({
    title: init.title || "", venue: init.venue || "", area: init.area || "",
    dateStr: "", time_label: init.time_label || "9:00 PM onwards",
    lineup: init.lineup || "DJ VIC", genre: init.genre || "",
    guestlist_enabled: init.guestlist_enabled ?? true, active: init.active ?? false,
  });
  const [bannerUrl, setBannerUrl] = useState(init.banner_url || "");
  const [busy, setBusy] = useState(false); const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const uploadBanner = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const sign = await fetch(`${FN}/admin-api?action=sign-upload`, {
        method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ folder: "djvic/events" }),
      }).then((r) => r.json());
      if (sign.error) throw new Error(sign.error);
      const up = await cloudinaryUpload(file, sign);
      setBannerUrl(up.secure_url); showToast("Banner uploaded.");
    } catch (e) { showToast(String(e.message || e)); }
    setUploading(false);
  };

  const save = async () => {
    if (!f.title.trim()) return showToast("Give the event a title.");
    if (!isEdit && !f.dateStr) return showToast("Pick the event date.");
    setBusy(true);
    const row = {
      slug: isEdit ? event.slug : `${slugify(f.title)}-${f.dateStr}`,
      title: f.title.trim(), venue: f.venue.trim() || null, area: f.area.trim() || null,
      time_label: f.time_label.trim() || null, lineup: f.lineup.trim() || null, genre: f.genre.trim() || null,
      banner_url: bannerUrl || null, guestlist_enabled: f.guestlist_enabled, active: f.active,
    };
    if (f.dateStr) Object.assign(row, deriveTimes(f.dateStr));
    const res = isEdit
      ? await supabase.from("events").update(row).eq("id", event.id).select().single()
      : await supabase.from("events").insert(row).select().single();
    if (res.error) {
      setBusy(false);
      return showToast(/duplicate|unique/i.test(res.error.message) ? "An event with this name + date already exists." : res.error.message);
    }
    if (f.active && res.data) await supabase.from("events").update({ active: false }).neq("id", res.data.id);
    setBusy(false); showToast(isEdit ? "Event updated." : "Event created."); onDone();
  };

  return (
    <>
      <button className="btn sm" onClick={onDone} style={{ marginBottom: 12 }}>← All events</button>
      <h1 className="h1">{isEdit ? "Edit event" : "New event"}</h1>
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
        <Field label="Title"><input className="search" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Chamatkar" /></Field>
        <div style={{ display: "flex", gap: 10 }}>
          <Field label="Venue"><input className="search" value={f.venue} onChange={(e) => setF({ ...f, venue: e.target.value })} placeholder="Happy Brew" /></Field>
          <Field label="Area / City"><input className="search" value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} placeholder="Koramangala, Bangalore" /></Field>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Field label={isEdit ? "Event date (blank = keep)" : "Event date"}><input className="search" type="date" value={f.dateStr} onChange={(e) => setF({ ...f, dateStr: e.target.value })} /></Field>
          <Field label="Time label"><input className="search" value={f.time_label} onChange={(e) => setF({ ...f, time_label: e.target.value })} placeholder="9:00 PM onwards" /></Field>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Field label="Lineup"><input className="search" value={f.lineup} onChange={(e) => setF({ ...f, lineup: e.target.value })} placeholder="DJ VIC" /></Field>
          <Field label="Genre / tagline"><input className="search" value={f.genre} onChange={(e) => setF({ ...f, genre: e.target.value })} placeholder="Bollywood / Commercial" /></Field>
        </div>
        <Field label="Banner image (3:2, optional)">
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {bannerUrl && <img src={bannerUrl} alt="" style={{ width: 90, height: 60, objectFit: "cover", borderRadius: 4, border: "1px solid #2a2a2a" }} />}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => uploadBanner(e.target.files?.[0])} />
            <button className="btn sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? <><Loader2 className="spin" size={14} /> Uploading…</> : <><Upload size={14} /> {bannerUrl ? "Replace" : "Upload"}</>}
            </button>
          </div>
        </Field>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: ".85rem", color: "rgba(255,255,255,.8)" }}>
          <input type="checkbox" checked={f.guestlist_enabled} onChange={(e) => setF({ ...f, guestlist_enabled: e.target.checked })} /> Guest-list RSVPs enabled
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: ".85rem", color: "rgba(255,255,255,.8)" }}>
          <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Show on website now (live popup)
        </label>
        <button className="btn" disabled={busy} onClick={save}>
          {busy ? <><Loader2 className="spin" size={16} /> Saving…</> : (isEdit ? "Save changes" : "Create event")}
        </button>
      </div>
    </>
  );
}

// ── Photos & videos (reels) for an event → public event page (event_media) ──
function ytThumb(url) {
  const s = String(url || "").trim();
  const short = s.match(/shorts\/([A-Za-z0-9_-]{6,})/);
  const m = short || s.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{6,})/);
  const id = m ? m[1] : (/^[A-Za-z0-9_-]{6,}$/.test(s) && !/[.\/]/.test(s) ? s : null);
  return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null;
}

function EventMediaManager({ event, onBack, showToast }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState("video");
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("event_media")
      .select("*").eq("event_slug", event.slug).order("sort_order", { ascending: true }).order("created_at", { ascending: true });
    if (error) showToast("Couldn't load media — run event_media.sql in Supabase.");
    setRows(data || []); setLoading(false);
  }, [event.slug, showToast]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    const u = url.trim();
    if (!u) return showToast(type === "video" ? "Paste a video link (YouTube / Shorts / mp4)." : "Paste an image URL.");
    setBusy(true);
    const nextOrder = rows.length ? Math.max(...rows.map((r) => r.sort_order || 0)) + 1 : 0;
    const { error } = await supabase.from("event_media").insert({
      event_slug: event.slug, type, url: u, caption: caption.trim() || null, sort_order: nextOrder,
    });
    setBusy(false);
    if (error) return showToast("Couldn't add — " + error.message);
    setUrl(""); setCaption(""); showToast(type === "video" ? "Reel added." : "Photo added."); load();
  };

  // Direct upload from the device (phone camera roll). Uploads to Cloudinary
  // via the signed /auto/upload endpoint (auto-detects video vs image), then
  // stores the resulting URL. Handles large videos (chunked in cloudinaryUpload).
  const uploadFile = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const sign = await fetch(`${FN}/admin-api?action=sign-upload`, {
        method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ folder: "djvic/event-media" }),
      }).then((r) => r.json());
      if (sign.error) throw new Error(sign.error);
      const up = await cloudinaryUpload(file, sign);
      const mtype = up.resource_type === "video" || /^video\//.test(file.type || "") ? "video" : "photo";
      const nextOrder = rows.length ? Math.max(...rows.map((r) => r.sort_order || 0)) + 1 : 0;
      const { error } = await supabase.from("event_media").insert({
        event_slug: event.slug, type: mtype, url: up.secure_url, caption: caption.trim() || null, sort_order: nextOrder,
      });
      if (error) throw new Error(error.message);
      setCaption(""); showToast(mtype === "video" ? "Reel uploaded." : "Photo uploaded."); load();
    } catch (e) { showToast("Upload failed — " + String(e.message || e)); }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const del = async (r) => {
    if (!window.confirm("Remove this item?")) return;
    const { error } = await supabase.from("event_media").delete().eq("id", r.id);
    if (error) return showToast("Delete failed — " + error.message);
    load();
  };
  const move = async (r, dir) => {
    const i = rows.findIndex((x) => x.id === r.id);
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const a = rows[i], b = rows[j];
    await Promise.all([
      supabase.from("event_media").update({ sort_order: b.sort_order }).eq("id", a.id),
      supabase.from("event_media").update({ sort_order: a.sort_order }).eq("id", b.id),
    ]);
    load();
  };

  const inp = { background: "rgba(10,10,10,.6)", border: "1px solid var(--line)", borderRadius: 6, padding: "8px 10px", color: "var(--off)", fontSize: ".85rem", fontFamily: "Inter", width: "100%" };
  const icBtn = { background: "none", border: "1px solid #2a2a2a", borderRadius: 6, padding: "6px 9px", color: "#cfcabf", cursor: "pointer", lineHeight: 0, minHeight: 30 };

  return (
    <>
      <button className="btn sm" onClick={onBack} style={{ marginBottom: 12 }}>← All events</button>
      <h1 className="h1">Photos &amp; videos — {event.title}</h1>
      <p className="sub">Drop in reels (YouTube, Shorts, or an .mp4 link) and photos. They show on the event page instantly — no redeploy. Reorder with the arrows; first added shows first.</p>

      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
        <div style={{ display: "inline-flex", border: "1px solid #2a2a2a", borderRadius: 7, overflow: "hidden", alignSelf: "flex-start" }}>
          {["video", "photo"].map((t) => (
            <button key={t} onClick={() => setType(t)} style={{ background: type === t ? "#c9a84c" : "transparent", color: type === t ? "#161616" : "#8a8878", border: 0, fontSize: 13, padding: "7px 16px", cursor: "pointer", fontWeight: type === t ? 600 : 400, textTransform: "capitalize" }}>{t === "video" ? "Reel / video" : "Photo"}</button>
          ))}
        </div>
        <input style={inp} value={url} onChange={(e) => setUrl(e.target.value)} placeholder={type === "video" ? "YouTube / Shorts link or .mp4 URL" : "Image URL (e.g. /images/chamatkar/1.jpg or a full URL)"} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        <input style={inp} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Caption (optional)" onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button className="btn" disabled={busy || uploading || !url.trim()} onClick={add}>
            {busy ? <><Loader2 className="spin" size={15} /> Adding…</> : <><Plus size={15} /> Add link</>}
          </button>
          <span style={{ fontSize: 12, color: "#66665e" }}>or</span>
          <input ref={fileRef} type="file" accept="video/*,image/*" hidden onChange={(e) => uploadFile(e.target.files?.[0])} />
          <button className="btn sm" disabled={uploading || busy} onClick={() => fileRef.current?.click()}>
            {uploading ? <><Loader2 className="spin" size={14} /> Uploading…</> : <><Upload size={14} /> Upload from phone</>}
          </button>
        </div>
        <p className="sub" style={{ margin: 0, fontSize: ".72rem" }}>Paste a YouTube/Shorts/.mp4 link, or upload a clip/photo straight from your device — large videos take a moment. Uploads auto-detect video vs photo.</p>
      </div>

      {loading ? <Center><Loader2 className="spin" size={18} /></Center> : rows.length === 0 ? (
        <p className="empty">Nothing added yet — drop your first reel above.</p>
      ) : (
        <div className="list" style={{ marginTop: 12 }}>
          {rows.map((r, i) => {
            const thumb = r.type === "video" ? ytThumb(r.url) : r.url;
            return (
              <div key={r.id} className="req" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 92, height: 58, flexShrink: 0, borderRadius: 5, overflow: "hidden", background: "#050505", border: "1px solid #222", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {thumb ? <img src={thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Film size={18} color="#666" />}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12.5, color: "#e8e8e0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <span className="tag" style={{ marginRight: 6 }}>{r.type}</span>{r.caption || r.url}
                  </div>
                  <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11.5, color: "#8a8878", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{r.url}</a>
                </div>
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <button style={icBtn} title="Move up" disabled={i === 0} onClick={() => move(r, -1)}>↑</button>
                  <button style={icBtn} title="Move down" disabled={i === rows.length - 1} onClick={() => move(r, 1)}>↓</button>
                  <button style={{ ...icBtn, color: "#e0574a" }} title="Remove" onClick={() => del(r)}><Trash2 size={14} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function NoteField({ initial, onSave }) {
  const [val, setVal] = useState(initial); const [dirty, setDirty] = useState(false);
  return (
    <div className="note">
      <input value={val} placeholder="Private note…" onChange={(e) => { setVal(e.target.value); setDirty(true); }} />
      {dirty && <button className="note-save" onClick={() => { onSave(val); setDirty(false); }}>Save</button>}
    </div>
  );
}

// ── Edit an already-logged booking ──
function BookingEditForm({ booking, onDone, onCancel, showToast }) {
  const b = booking;
  const [f, setF] = useState({
    name: b.name || "", contact: b.contact && b.contact !== "—" ? b.contact : "",
    event_type: b.event_type || "private", event_date: b.event_date || "", event_end_date: b.event_end_date || "",
    venue: b.venue || "", city: b.city || "", amount: b.agreed_fee ?? "", message: b.message || "",
  });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!f.name.trim()) return showToast("Name is required.");
    if (!f.event_date) return showToast("Pick the date.");
    if (f.event_end_date && f.event_end_date < f.event_date) return showToast("End date can't be before the start date.");
    setBusy(true);
    const { error } = await supabase.from("bookings").update({
      name: f.name.trim(), contact: f.contact.trim() || "—", event_type: f.event_type,
      event_date: f.event_date, event_end_date: f.event_end_date || null,
      venue: f.venue.trim() || null, city: f.city.trim() || null,
      agreed_fee: f.amount === "" || f.amount == null ? null : Number(f.amount),
      message: f.message.trim() || null,
    }).eq("id", b.id);
    setBusy(false);
    if (error) return showToast("Save failed: " + error.message);
    showToast("Booking updated."); onDone();
  };
  return (
    <>
      <div className="row-between"><button className="note-save" onClick={onCancel}>← Back</button></div>
      <h1 className="h1" style={{ marginTop: 10 }}>Edit booking</h1>
      {b.status === "accepted" && <p className="sub" style={{ color: "#e0b13c" }}>Note: if you change the date of a confirmed gig, re-sync it to your Google Calendar from the booking afterwards.</p>}
      <div className="card entry">
        <div className="grid2">
          <div className="field"><label>Client / venue</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div className="field"><label>Contact</label><input value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} /></div>
          <div className="field"><label>Type</label><select value={f.event_type} onChange={(e) => setF({ ...f, event_type: e.target.value })}>{EVENT_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
          <div className="field"><label>Amount (₹)</label><input type="number" min="0" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="e.g. 150000" /></div>
          <div className="field"><label>Date (from)</label><input type="date" value={f.event_date} onChange={(e) => setF({ ...f, event_date: e.target.value })} /></div>
          <div className="field"><label>To (optional — multi-day)</label><input type="date" value={f.event_end_date} min={f.event_date || undefined} onChange={(e) => setF({ ...f, event_end_date: e.target.value })} /></div>
          <div className="field"><label>Venue</label><input value={f.venue} onChange={(e) => setF({ ...f, venue: e.target.value })} /></div>
          <div className="field"><label>City</label><input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></div>
        </div>
        <div className="field"><label>Notes / message</label><textarea rows={2} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} /></div>
        <div className="req-actions">
          <button className="act wa" disabled={busy} onClick={save}>{busy ? <Loader2 className="spin" size={15} /> : <CheckCircle2 size={15} />} Save changes</button>
          <button className="act" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </>
  );
}

function ManualEntry({ onDone, showToast, initial }) {
  const i = initial || {};
  const [f, setF] = useState({ name: i.name || "", contact: i.contact || "", event_type: i.event_type || "private", event_date: i.event_date || "", event_end_date: i.event_end_date || "", venue: i.venue || "", city: i.city || "", amount: i.amount ?? "", message: i.message || "", confirmed: false });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!f.name || !f.event_date) return showToast("Name and date required.");
    if (f.event_end_date && f.event_end_date < f.event_date) return showToast("End date can't be before the start date.");
    setBusy(true);
    const { data, error } = await supabase.from("bookings").insert({
      name: f.name, contact: f.contact || "—", event_type: f.event_type, event_date: f.event_date,
      event_end_date: f.event_end_date || null,
      venue: f.venue, city: f.city, agreed_fee: f.amount === "" || f.amount == null ? null : Number(f.amount), message: f.message || null, source: "manual",
      status: f.confirmed ? "accepted" : "pending",
    }).select().single();
    if (error) { setBusy(false); return showToast(error.message); }
    let calErr = null;
    if (f.confirmed && data?.id) {
      const cal = await fetch(`${FN}/calendar-sync?action=confirm`, {
        method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ bookingId: data.id }),
      }).then((r) => r.json()).catch(() => ({ error: "Network error" }));
      if (cal?.error) calErr = cal.error;
    }
    setBusy(false);
    showToast(calErr ? `Saved — but calendar sync failed: ${calErr}. Use "Sync to calendar".` : (f.confirmed ? "Gig logged & confirmed." : "Enquiry logged."));
    onDone();
  };
  return (
    <div className="card entry">
      <div className="grid2">
        <div className="field"><label>Client / venue</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="field"><label>Contact</label><input value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} /></div>
        <div className="field"><label>Type</label><select value={f.event_type} onChange={(e) => setF({ ...f, event_type: e.target.value })}>{EVENT_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
        <div className="field"><label>Amount (₹)</label><input type="number" min="0" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="e.g. 150000" /></div>
        <div className="field"><label>Date (from)</label><input type="date" value={f.event_date} onChange={(e) => setF({ ...f, event_date: e.target.value })} /></div>
        <div className="field"><label>To (optional — multi-day)</label><input type="date" value={f.event_end_date} min={f.event_date || undefined} onChange={(e) => setF({ ...f, event_end_date: e.target.value })} /></div>
        <div className="field"><label>Venue</label><input value={f.venue} onChange={(e) => setF({ ...f, venue: e.target.value })} /></div>
        <div className="field"><label>City</label><input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></div>
      </div>
      <div className="field"><label>Notes / original message</label><textarea rows={2} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} /></div>
      <label className="check"><input type="checkbox" checked={f.confirmed} onChange={(e) => setF({ ...f, confirmed: e.target.checked })} /> Already confirmed — add to my calendar (leave off to log as an enquiry)</label>
      <button className="btn" onClick={save} disabled={busy}>{busy ? <Loader2 className="spin" size={16} /> : (f.confirmed ? "Save gig" : "Log enquiry")}</button>
    </div>
  );
}

// ---------------- CALENDAR (block dates) ----------------
function CalendarTab({ showToast }) {
  const today = useMemo(() => new Date(), []);
  const [cur, setCur] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [map, setMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [checkDate, setCheckDate] = useState("");      // quick "is this date free?" lookup
  const [checkGigs, setCheckGigs] = useState([]);       // bookings covering checkDate

  const dim = new Date(cur.y, cur.m + 1, 0).getDate();
  const fw = new Date(cur.y, cur.m, 1).getDay();

  // Pull the gig(s) on the checked date (handles multi-day ranges too) so we can
  // show WHO it's booked for, and so a multi-day gig reads as booked on every day.
  useEffect(() => {
    if (!checkDate) { setCheckGigs([]); return; }
    let cancelled = false;
    supabase.from("bookings")
      .select("name,event_type,status,event_date,event_end_date")
      .or(`event_date.eq.${checkDate},and(event_date.lte.${checkDate},event_end_date.gte.${checkDate})`)
      .then(({ data }) => { if (!cancelled) setCheckGigs((data || []).filter((b) => b.status === "accepted" || b.status === "pending")); });
    return () => { cancelled = true; };
  }, [checkDate]);

  const pickDate = (val) => {
    setCheckDate(val);
    if (val) { const [y, mo] = val.split("-").map(Number); setCur({ y, m: mo - 1 }); }
  };

  const load = useCallback(async () => {
    setLoading(true);
    const from = ymd(cur.y, cur.m, 1), to = ymd(cur.y, cur.m, dim);
    const [rpc, busy] = await Promise.all([
      supabase.rpc("public_calendar", { p_from: from, p_to: to }),
      fetch(`${FN}/calendar-sync?action=availability&from=${from}&to=${to}`).then((r) => r.json()).catch(() => ({ busy: [] })),
    ]);
    const m = {};
    (rpc.data || []).forEach((r) => { m[r.the_date] = r.state; });
    // Google-busy nights (read-only here — managed in Google Calendar), only where
    // there isn't already a manual block / hold / booking.
    (busy.busy || []).forEach((d) => { if (!m[d]) m[d] = "busy"; });
    setMap(m); setLoading(false);
  }, [cur, dim]);
  useEffect(() => { load(); }, [load]);

  const toggle = async (day) => {
    const key = ymd(cur.y, cur.m, day); const st = map[key];
    if (st === "booked" || st === "held") return showToast("That night has a booking — manage it in Bookings.");
    if (st === "busy") return showToast("Busy in your Google Calendar — manage it there.");
    const { error } = st === "blocked"
      ? await supabase.from("availability_blocks").delete().eq("block_date", key)
      : await supabase.from("availability_blocks").insert({ block_date: key, reason: "Manual block" });
    if (error) return showToast(error.message || "Could not update — availability_blocks write was rejected.");
    showToast(st === "blocked" ? "Unblocked." : "Blocked.");
    load();
  };

  // Resolve the checked date's status (gigs override the month map so multi-day
  // ranges and pending holds always read correctly).
  const accepted = checkGigs.filter((b) => b.status === "accepted");
  const pending = checkGigs.filter((b) => b.status === "pending");
  let checkState = checkDate ? (map[checkDate] || "open") : null;
  if (checkState && accepted.length) checkState = "booked";
  else if (checkState === "open" && pending.length) checkState = "held";
  const STAT = {
    open:    { label: "Available", cls: "free", sub: "This date is free — go for it." },
    blocked: { label: "Not available", cls: "taken", sub: "You've blocked this night off." },
    busy:    { label: "Not available", cls: "taken", sub: "Busy in your Google Calendar." },
    held:    { label: "On hold", cls: "hold", sub: "A pending enquiry is holding this date." },
    booked:  { label: "Booked", cls: "taken", sub: "You have a confirmed gig this night." },
  };
  const stat = checkState ? STAT[checkState] : null;
  const who = checkGigs.map((b) => `${b.name}${b.event_type ? ` · ${b.event_type}` : ""}`).join("  /  ");
  const checkLabel = checkDate ? new Date(checkDate + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "";

  return (
    <>
      <style>{`
        .cal-check { background: #121214; border: 1px solid #2a2a2a; border-radius: 10px; padding: 14px 16px; margin: 6px 0 16px; }
        .cal-check > label { display: flex; flex-direction: column; gap: 6px; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: #8a8878; font-weight: 600; }
        .cal-check input[type=date] { background: #0e0e0e; border: 1px solid #2a2a2a; color: #e8e8e0; padding: 12px 14px; border-radius: 8px; font-size: 16px; width: 100%; max-width: 280px; }
        .cal-result { margin-top: 14px; border-radius: 8px; padding: 13px 16px; border: 1px solid; }
        .cal-result--free { background: rgba(78,167,101,.12); border-color: rgba(78,167,101,.5); }
        .cal-result--taken { background: rgba(224,87,74,.12); border-color: rgba(224,87,74,.5); }
        .cal-result--hold { background: rgba(224,177,60,.12); border-color: rgba(224,177,60,.5); }
        .cr-date { font-size: 13px; color: #cfcabf; }
        .cr-status { font-size: 22px; font-weight: 700; margin-top: 1px; line-height: 1.1; }
        .cal-result--free .cr-status { color: #5bbd77; }
        .cal-result--taken .cr-status { color: #e8736a; }
        .cal-result--hold .cr-status { color: #e0b13c; }
        .cr-sub { font-size: 13px; color: #9a9a8a; margin-top: 5px; }
        .cc.checked { outline: 2px solid #c9a84c; outline-offset: -2px; border-radius: 4px; }
      `}</style>
      <div className="row-between">
        <h1 className="h1">Calendar</h1>
        <div className="mnav">
          <button onClick={() => setCur((c) => { const d = new Date(c.y, c.m - 1, 1); return { y: d.getFullYear(), m: d.getMonth() }; })}>‹</button>
          <span>{MONTHS[cur.m]} {cur.y}</span>
          <button onClick={() => setCur((c) => { const d = new Date(c.y, c.m + 1, 1); return { y: d.getFullYear(), m: d.getMonth() }; })}>›</button>
        </div>
      </div>

      <div className="cal-check">
        <label>Check a date — am I free?
          <input type="date" value={checkDate} onChange={(e) => pickDate(e.target.value)} />
        </label>
        {stat && (
          <div className={`cal-result cal-result--${stat.cls}`}>
            <div className="cr-date">{checkLabel}</div>
            <div className="cr-status">{stat.cls === "free" ? "✓ " : "● "}{stat.label}</div>
            <div className="cr-sub">{(checkState === "booked" || checkState === "held") && who ? who : stat.sub}</div>
          </div>
        )}
      </div>

      <p className="sub">Tap a night to block / unblock it. Booked & held nights are managed in Bookings.</p>
      <div className="card">
        {loading && <Center><Loader2 className="spin" size={16} /></Center>}
        <div className="cal-head">{["S","M","T","W","T","F","S"].map((d, i) => <span key={i}>{d}</span>)}</div>
        <div className="cal-grid">
          {Array.from({ length: fw }).map((_, i) => <span key={`b${i}`} className="cc empty" />)}
          {Array.from({ length: dim }).map((_, i) => {
            const day = i + 1; const key = ymd(cur.y, cur.m, day); const st = map[key] || "open";
            return <button key={day} className={`cc ${st}${key === checkDate ? " checked" : ""}`} onClick={() => toggle(day)}>{day}</button>;
          })}
        </div>
        <div className="legend">
          <span><i className="dot open" /> Open</span>
          <span><i className="dot blocked" /> Blocked</span>
          <span><i className="dot busy" /> Busy (Google)</span>
          <span><i className="dot held" /> Held</span>
          <span><i className="dot booked" /> Booked</span>
        </div>
      </div>
    </>
  );
}

// ---------------- MEDIA ----------------
function Media({ showToast }) {
  const [items, setItems] = useState([]); const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState("gallery"); const fileRef = useRef();

  const load = useCallback(async () => {
    const { data } = await supabase.from("media").select("*").order("sort").order("created_at", { ascending: false });
    setItems(data || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const upload = async (files) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    setBusy(true);
    let sort = items.filter((m) => m.kind === kind).reduce((mx, m) => Math.max(mx, m.sort || 0), 0);
    let ok = 0;
    for (const file of list) {
      try {
        const sign = await fetch(`${FN}/admin-api?action=sign-upload`, {
          method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) },
          body: JSON.stringify({ folder: `djvic/${kind}` }),
        }).then((r) => r.json());
        if (sign.error) throw new Error(sign.error);

        const up = await cloudinaryUpload(file, sign);

        sort += 1;
        await supabase.from("media").insert({ public_id: up.public_id, url: up.secure_url, kind, sort });
        ok += 1;
      } catch (e) {
        const msg = String(e?.message || e);
        showToast(/failed to fetch/i.test(msg)
          ? "Upload failed — network issue or the video exceeds your Cloudinary plan limit. Try a smaller/compressed file."
          : msg);
      }
    }
    if (ok) showToast(`Uploaded ${ok} file${ok === 1 ? "" : "s"} — live on the site.`);
    setBusy(false); load();
  };

  const remove = async (m) => {
    await supabase.from("media").delete().eq("id", m.id);
    showToast("Removed."); load();
  };

  const shown = items.filter((m) => m.kind === kind);

  // Reorder by re-sequencing sort 1..n (self-heals null/duplicate sorts; only
  // writes the rows whose sort actually changed).
  const move = async (m, dir) => {
    const list = [...shown];
    const i = list.findIndex((x) => x.id === m.id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    await Promise.all(
      list.map((x, idx) => (x.sort === idx + 1 ? null : supabase.from("media").update({ sort: idx + 1 }).eq("id", x.id))).filter(Boolean)
    );
    load();
  };
  return (
    <>
      <h1 className="h1">Gallery &amp; Media</h1>
      <p className="sub">A live mirror of the public site. Pick a set, then upload or delete — changes go live instantly.</p>
      <div className="card upload-card">
        <div className="chips">
          {["gallery", "press", "logo"].map((k) => (
            <button key={k} className={kind === k ? "chip on" : "chip"} onClick={() => setKind(k)}>{k}</button>
          ))}
        </div>
        <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => upload(e.target.files)} />
        <button className="btn" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? <><Loader2 className="spin" size={16} /> Uploading…</> : <><Upload size={16} /> Upload images / videos</>}
        </button>
        <span className="sub" style={{ margin: 0 }}>{shown.length} in “{kind}”</span>
      </div>
      <div className="media-grid">
        {shown.map((m) => (
          <div key={m.id} className="media-cell">
            {isVideo(m.url)
              ? <video src={m.url} muted playsInline preload="metadata" />
              : <img src={m.url} alt={m.caption || ""} />}
            {isVideo(m.url) && <span className="vplay" aria-hidden="true">▶</span>}
            <div className="media-move">
              <button onClick={() => move(m, -1)} aria-label="Move earlier">◀</button>
              <button onClick={() => move(m, 1)} aria-label="Move later">▶</button>
            </div>
            <button className="media-del" onClick={() => remove(m)}><Trash2 size={14} /></button>
          </div>
        ))}
        {shown.length === 0 && <p className="empty">Nothing in “{kind}” yet — upload to add.</p>}
      </div>
    </>
  );
}

// ---------------- PAGE IMAGES ----------------
function PageImages({ showToast }) {
  const [map, setMap] = useState({}); const [busy, setBusy] = useState(null);
  const [blogSlots, setBlogSlots] = useState([]);
  const fileRefs = useRef({});

  const load = useCallback(async () => {
    const { data } = await supabase.from("site_images").select("*");
    const m = {}; (data || []).forEach((r) => { m[r.slot] = r; }); setMap(m);
  }, []);
  useEffect(() => { load(); }, [load]);
  // Blog posts are dynamic — pull their slots from the build-time JSON so new
  // posts show up here automatically.
  useEffect(() => {
    fetch("/blog-image-slots.json").then((r) => r.json()).then((rows) => setBlogSlots(rows || [])).catch(() => {});
  }, []);

  const slots = [...IMAGE_SLOTS, ...blogSlots];

  const upload = async (slot, file) => {
    if (!file) return;
    setBusy(slot);
    try {
      const sign = await fetch(`${FN}/admin-api?action=sign-upload`, {
        method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ folder: "djvic/site" }),
      }).then((r) => r.json());
      if (sign.error) throw new Error(sign.error);
      const fd = new FormData();
      fd.append("file", file); fd.append("api_key", sign.apiKey);
      fd.append("timestamp", sign.timestamp); fd.append("signature", sign.signature);
      fd.append("folder", sign.folder);
      const up = await fetch(sign.uploadUrl, { method: "POST", body: fd }).then((r) => r.json());
      if (!up.secure_url) throw new Error(up.error?.message || "Upload failed");
      const { error } = await supabase.from("site_images").upsert({ slot, url: up.secure_url, public_id: up.public_id, updated_at: new Date().toISOString() });
      if (error) throw new Error(error.message);
      showToast("Updated — live on the site."); load();
    } catch (e) { showToast(String(e.message || e)); }
    setBusy(null);
  };

  const reset = async (slot) => {
    await supabase.from("site_images").delete().eq("slot", slot);
    showToast("Reset to the original."); load();
  };

  return (
    <>
      <h1 className="h1">Page Images</h1>
      <p className="sub">Replace any in-house page image — uploads go live instantly. (Gallery photos &amp; videos are in the Media tab.)</p>
      <div className="pi-grid">
        {slots.map((s) => {
          const cur = map[s.slot];
          return (
            <div key={s.slot} className="pi-card">
              <div className="pi-thumb">
                <img src={cur ? cur.url : s.default} alt={s.label} loading="lazy" />
                <span className="pi-tag">{cur ? "Custom" : "Original"}</span>
              </div>
              <div className="pi-info"><strong>{s.label}</strong><span className="pi-page">{s.page}</span><span className="pi-size">↳ {s.size}</span></div>
              <input type="file" accept="image/*" hidden ref={(el) => (fileRefs.current[s.slot] = el)} onChange={(e) => upload(s.slot, e.target.files?.[0])} />
              <div className="pi-actions">
                <button className="btn sm" disabled={busy === s.slot} onClick={() => fileRefs.current[s.slot]?.click()}>
                  {busy === s.slot ? <Loader2 className="spin" size={13} /> : <Upload size={13} />} Replace
                </button>
                {cur && <button className="btn sm ghost" onClick={() => reset(s.slot)}>Reset</button>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ---------------- TESTIMONIALS ----------------
function Testimonials({ showToast }) {
  const [items, setItems] = useState([]); const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ author: "", role: "", quote: "", rating: 5, category: "home" });
  const [edit, setEdit] = useState(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("testimonials").select("*").order("sort").order("created_at", { ascending: false });
    setItems(data || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!f.author || !f.quote) return showToast("Author and quote required.");
    setBusy(true);
    const { error } = await supabase.from("testimonials").insert({ ...f, approved: true });
    setBusy(false);
    if (error) return showToast(error.message);
    setF({ author: "", role: "", quote: "", rating: 5, category: "home" }); showToast("Added."); load();
  };
  const toggle = async (t) => { await supabase.from("testimonials").update({ approved: !t.approved }).eq("id", t.id); load(); };
  const remove = async (t) => { await supabase.from("testimonials").delete().eq("id", t.id); load(); };
  const setCategory = async (t, category) => {
    const { error } = await supabase.from("testimonials").update({ category }).eq("id", t.id);
    if (error) return showToast(error.message);
    showToast(category === "wedding" ? "Moved to Weddings page." : "Moved to Homepage."); load();
  };
  const save = async () => {
    if (!edit.author || !edit.quote) return showToast("Author and quote required.");
    setBusy(true);
    const { error } = await supabase.from("testimonials").update({ author: edit.author, role: edit.role, quote: edit.quote, rating: edit.rating, category: edit.category }).eq("id", edit.id);
    setBusy(false);
    if (error) return showToast(error.message);
    setEdit(null); showToast("Updated."); load();
  };

  return (
    <>
      <h1 className="h1">Reviews</h1>
      <div className="card entry">
        <div className="grid2">
          <div className="field"><label>Author</label><input value={f.author} onChange={(e) => setF({ ...f, author: e.target.value })} /></div>
          <div className="field"><label>Role</label><input value={f.role} placeholder="Bride / Skyline Lounge…" onChange={(e) => setF({ ...f, role: e.target.value })} /></div>
        </div>
        <div className="field"><label>Quote</label><textarea rows={2} value={f.quote} onChange={(e) => setF({ ...f, quote: e.target.value })} /></div>
        <div className="field"><label>Rating</label>
          <div className="stars">{[1,2,3,4,5].map((n) => <Star key={n} size={20} onClick={() => setF({ ...f, rating: n })} fill={n <= f.rating ? "#C9A84C" : "none"} color="#C9A84C" style={{ cursor: "pointer" }} />)}</div>
        </div>
        <div className="field"><label>Shows on</label>
          <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            <option value="home">Homepage</option>
            <option value="wedding">Weddings page</option>
          </select>
        </div>
        <button className="btn" onClick={add} disabled={busy}>{busy ? <Loader2 className="spin" size={16} /> : <><Plus size={15} /> Add review</>}</button>
      </div>
      <div className="list">
        {items.map((t) => (
          <div key={t.id} className={`req ${t.approved ? "accepted" : ""}`}>
            {edit && edit.id === t.id ? (
              <>
                <div className="grid2">
                  <div className="field"><label>Author</label><input value={edit.author} onChange={(e) => setEdit({ ...edit, author: e.target.value })} /></div>
                  <div className="field"><label>Role</label><input value={edit.role || ""} onChange={(e) => setEdit({ ...edit, role: e.target.value })} /></div>
                </div>
                <div className="field"><label>Quote</label><textarea rows={2} value={edit.quote} onChange={(e) => setEdit({ ...edit, quote: e.target.value })} /></div>
                <div className="field"><label>Rating</label>
                  <div className="stars">{[1,2,3,4,5].map((n) => <Star key={n} size={20} onClick={() => setEdit({ ...edit, rating: n })} fill={n <= edit.rating ? "#C9A84C" : "none"} color="#C9A84C" style={{ cursor: "pointer" }} />)}</div>
                </div>
                <div className="req-actions">
                  <button className="act wa" onClick={save} disabled={busy}>{busy ? <Loader2 className="spin" size={14} /> : <><CheckCircle2 size={14} /> Save</>}</button>
                  <button className="act decline" onClick={() => setEdit(null)}>Cancel</button>
                </div>
              </>
            ) : (
              <>
                <div className="req-top">
                  <div><h3>{t.author} {t.role && <span className="mini">{t.role}</span>}</h3>
                    <div className="stars sm">{Array.from({ length: t.rating || 0 }).map((_, i) => <Star key={i} size={13} fill="#C9A84C" color="#C9A84C" />)}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <select className="mini-sel" value={t.category || "home"} onChange={(e) => setCategory(t, e.target.value)} title="Shows on">
                      <option value="home">Homepage</option>
                      <option value="wedding">Weddings page</option>
                    </select>
                    <span className={`status ${t.approved ? "accepted" : "pending"}`}>{t.approved ? "live" : "hidden"}</span>
                  </div>
                </div>
                <p className="req-msg">"{t.quote}"</p>
                <div className="req-actions">
                  <button className="act wa" onClick={() => setEdit({ id: t.id, author: t.author, role: t.role || "", quote: t.quote, rating: t.rating || 5, category: t.category || "home" })}><Plus size={14} /> Edit</button>
                  <button className="act wa" onClick={() => toggle(t)}>{t.approved ? <><Ban size={14} /> Hide</> : <><CheckCircle2 size={14} /> Show</>}</button>
                  <button className="act decline" onClick={() => remove(t)}><Trash2 size={14} /> Delete</button>
                </div>
              </>
            )}
          </div>
        ))}
        {items.length === 0 && <p className="empty">No reviews yet.</p>}
      </div>
    </>
  );
}

// ---------------- MARKETING · Search (GSC) sub-view ----------------
function MarketingSearch({ data, loading }) {
  if (loading) return <Center><Loader2 className="spin" size={20} /> Pulling Search Console…</Center>;
  if (!data?.connected) return (
    <div className="card">
      <p className="sub" style={{ margin: 0 }}>Search Console isn't wired up yet{data?.reason ? ` (${data.reason})` : ""}. Once djvicofficial.com is verified in GSC and the admin-api has the webmasters scope, your top queries and pages show here.</p>
    </div>
  );

  const t = data.totals || {};
  const pct = (n) => `${((n || 0) * 100).toFixed(1)}%`;
  const stripDomain = (u) => (u || "").replace(/^https?:\/\/[^/]+/, "") || "/";
  // Sort the top tables by impressions (times shown) — at this traffic level
  // clicks are too sparse to rank meaningfully, so visibility is the better lens.
  const byImpr = (rows) => [...(rows || [])].sort((a, b) => (b.impressions || 0) - (a.impressions || 0));
  // Easy wins: queries ranking page-1-bottom / page-2 with real impressions.
  const opps = [...(data.queries || [])]
    .filter((r) => r.position >= 4 && r.position <= 15 && (r.impressions || 0) > 0)
    .sort((a, b) => b.impressions - a.impressions).slice(0, 6);

  return (
    <>
      <div className="cards">
        <Stat label="Visitors from Google" value={t.clicks ?? 0} hint="People who clicked to your site from a Google search" />
        <Stat label="Times you showed up" value={(t.impressions ?? 0).toLocaleString()} hint="How often your site appeared in Google's results" />
        <Stat label="Click rate" value={pct(t.ctr)} hint="Of everyone who saw you, the % who clicked" />
        <Stat label="Average ranking" value={(t.position ?? 0).toFixed(1)} hint="Your spot in Google results — 1 is the top. Lower is better." />
      </div>

      {opps.length > 0 && (
        <div className="card">
          <h3 className="card-h">Easy wins · searches where you're close to the top</h3>
          <p className="sub" style={{ marginTop: 0 }}>You already show up for these searches but sit just below the top results. A little attention to these pages could push them up and win more clicks.</p>
          <table className="seo">
            <thead><tr><th>What people searched</th><th>Times shown</th><th>Clicks</th><th>Click rate</th><th>Rank</th></tr></thead>
            <tbody>
              {opps.map((r, i) => (
                <tr key={i}><td className="ellip">{r.key}</td><td>{r.impressions}</td><td>{r.clicks}</td><td>{pct(r.ctr)}</td><td>{r.position?.toFixed(1)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid2-wide">
        <SeoTable title="What people searched to find you" rows={byImpr(data.queries)} keyLabel="Search term" />
        <SeoTable title="Your most-seen pages" rows={byImpr(data.pages)} keyLabel="Page" transform={stripDomain} />
      </div>
    </>
  );
}
function SeoTable({ title, rows, keyLabel, transform }) {
  const pct = (n) => `${((n || 0) * 100).toFixed(1)}%`;
  return (
    <div className="card">
      <h3 className="card-h">{title}</h3>
      <table className="seo">
        <thead><tr><th>{keyLabel}</th><th>Clicks</th><th>Times shown</th><th>Click rate</th><th>Rank</th></tr></thead>
        <tbody>
          {(rows || []).map((r, i) => (
            <tr key={i}><td className="ellip">{transform ? transform(r.key) : r.key}</td><td>{r.clicks}</td><td>{r.impressions}</td><td>{pct(r.ctr)}</td><td>{r.position?.toFixed(1)}</td></tr>
          ))}
          {(!rows || rows.length === 0) && <tr><td colSpan={5} className="empty">No data.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// Newsletter — Contacts · Compose · History
// ============================================================
function Newsletter({ showToast }) {
  const [sub, setSub] = useState("contacts");
  const NL_TABS = [
    ["contacts", "Contacts", Users],
    ["compose", "Compose", Mail],
    ["history", "History", History],
  ];
  return (
    <div>
      <div className="nl-tabs">
        {NL_TABS.map(([k, label, Icon]) => (
          <button key={k} className={sub === k ? "nl-tab on" : "nl-tab"} onClick={() => setSub(k)}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>
      {sub === "contacts" && <NLContacts showToast={showToast} />}
      {sub === "compose"  && <NLCompose  showToast={showToast} />}
      {sub === "history"  && <NLHistory  showToast={showToast} />}
    </div>
  );
}

function NLContacts({ showToast }) {
  const [subs, setSubs]     = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [addEmail, setAddEmail] = useState("");
  const [addName, setAddName]   = useState("");
  const [addList, setAddList]   = useState("monthly");
  const [adding, setAdding]     = useState(false);
  const [audStatus, setAudStatus] = useState(null);
  const [initBusy, setInitBusy]   = useState(false);

  async function load(q = "") {
    setLoading(true);
    const qs = q ? `?action=contacts&q=${encodeURIComponent(q)}` : "?action=contacts";
    const h = await authHeader();
    const r = await fetch(`${FN}/newsletter-manager${qs}`, { headers: h });
    const d = await r.json();
    setSubs(d.subscribers ?? []);
    setLoading(false);
  }

  async function checkAud() {
    const { data } = await supabase.from("newsletter_config").select("key, value");
    const cfg = Object.fromEntries((data ?? []).map(r => [r.key, r.value]));
    setAudStatus({
      monthly: cfg.resend_audience_monthly ?? null,
      weekly:  cfg.resend_audience_weekly  ?? null,
    });
  }

  useEffect(() => { load(); checkAud(); }, []);

  async function initAudiences() {
    setInitBusy(true);
    const h = await authHeader();
    const r = await fetch(`${FN}/newsletter-manager`, {
      method: "POST", headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "setup-audiences" }),
    });
    const d = await r.json();
    setInitBusy(false);
    if (d.ok) { showToast("Audiences created ✓"); checkAud(); }
    else showToast("Error: " + JSON.stringify(d));
  }

  async function addContact() {
    if (!addEmail.trim()) return;
    setAdding(true);
    const h = await authHeader();
    const r = await fetch(`${FN}/newsletter-manager`, {
      method: "POST", headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add-contact", email: addEmail.trim(), name: addName.trim(), list: addList }),
    });
    const d = await r.json();
    setAdding(false);
    if (d.ok) { showToast("Contact added ✓"); setAddEmail(""); setAddName(""); load(search); }
    else showToast("Error: " + (d.error || JSON.stringify(d)));
  }

  async function removeContact(email) {
    if (!confirm(`Unsubscribe ${email}?`)) return;
    const h = await authHeader();
    await fetch(`${FN}/newsletter-manager`, {
      method: "POST", headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove-contact", email }),
    });
    showToast("Unsubscribed ✓");
    load(search);
  }

  const bothOk = audStatus?.monthly && audStatus?.weekly;

  return (
    <div className="card">
      <div className="nl-aud-bar">
        <div className="nl-aud-pills">
          <span className={`nl-aud-pill ${audStatus?.monthly ? "ok" : "missing"}`}>Monthly {audStatus?.monthly ? "✓" : "✗"}</span>
          <span className={`nl-aud-pill ${audStatus?.weekly  ? "ok" : "missing"}`}>Weekly {audStatus?.weekly  ? "✓" : "✗"}</span>
        </div>
        {!bothOk && (
          <button className="btn sm" onClick={initAudiences} disabled={initBusy}>
            {initBusy ? <Loader2 size={13} className="spin" /> : null} Initialize Audiences
          </button>
        )}
      </div>

      <div className="nl-add-row">
        <input className="nl-inp" placeholder="email@example.com" value={addEmail} onChange={e => setAddEmail(e.target.value)} />
        <input className="nl-inp" placeholder="Name (optional)" value={addName} onChange={e => setAddName(e.target.value)} />
        <select className="nl-sel" value={addList} onChange={e => setAddList(e.target.value)}>
          <option value="monthly">Monthly</option>
          <option value="weekly">Weekly</option>
          <option value="both">Both</option>
        </select>
        <button className="btn sm" onClick={addContact} disabled={adding}>
          {adding ? <Loader2 size={13} className="spin" /> : <Plus size={13} />} Add
        </button>
      </div>

      <div className="nl-search-row">
        <input className="search" style={{margin:0}} placeholder="Search subscribers…" value={search}
          onChange={e => { setSearch(e.target.value); load(e.target.value); }} />
        <span className="nl-count">{subs.length} subscriber{subs.length !== 1 ? "s" : ""}</span>
      </div>

      {loading ? (
        <div className="center"><Loader2 size={20} className="spin" /></div>
      ) : subs.length === 0 ? (
        <div className="empty">No subscribers found</div>
      ) : (
        <div className="nl-table-wrap">
          <table className="nl-table">
            <thead><tr>
              <th>Email</th><th>Name</th><th>List</th><th>Source</th><th>Status</th><th>Joined</th><th></th>
            </tr></thead>
            <tbody>
              {subs.map(s => (
                <tr key={s.id} className={s.status !== "active" ? "nl-unsub" : ""}>
                  <td>{s.email}</td>
                  <td>{s.name || <span style={{color:"var(--grey)"}}>—</span>}</td>
                  <td><span className="nl-badge">{s.list}</span></td>
                  <td style={{color:"var(--grey)",fontSize:11}}>{s.source}</td>
                  <td><span className={`status ${s.status === "active" ? "accepted" : "declined"}`}>{s.status}</span></td>
                  <td style={{color:"var(--grey)",fontSize:11,whiteSpace:"nowrap"}}>{new Date(s.subscribed_at).toLocaleDateString("en-IN")}</td>
                  <td>
                    {s.status === "active" && (
                      <button className="nl-del" title="Unsubscribe" onClick={() => removeContact(s.email)}>
                        <Trash2 size={12} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function NLCompose({ showToast }) {
  const [audience, setAudience] = useState("monthly");
  const [subject, setSubject]   = useState("");
  const [html, setHtml]         = useState("");
  const [preview, setPreview]   = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending]   = useState(false);
  const [draft, setDraft]       = useState(null); // { broadcastId, recipientCount }
  const [confirmSend, setConfirmSend] = useState(false);

  async function createDraft() {
    if (!subject.trim() || !html.trim()) { showToast("Subject and HTML are required"); return; }
    setDrafting(true);
    setDraft(null);
    setConfirmSend(false);
    const h = await authHeader();
    const r = await fetch(`${FN}/newsletter-manager`, {
      method: "POST", headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "draft", subject: subject.trim(), html: html.trim(), audience }),
    });
    const d = await r.json();
    setDrafting(false);
    if (d.ok) {
      setDraft(d);
      showToast(`Draft created — ${d.recipientCount} recipient${d.recipientCount !== 1 ? "s" : ""}`);
    } else {
      showToast("Error: " + (d.error || JSON.stringify(d)));
    }
  }

  async function sendNow() {
    if (!draft?.broadcastId) return;
    setSending(true);
    const h = await authHeader();
    const r = await fetch(`${FN}/newsletter-manager`, {
      method: "POST", headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "send", broadcastId: draft.broadcastId }),
    });
    const d = await r.json();
    setSending(false);
    setConfirmSend(false);
    if (d.ok) {
      showToast("Newsletter sent ✓");
      setDraft(null);
      setSubject(""); setHtml("");
    } else {
      showToast("Send error: " + (d.error || JSON.stringify(d)));
    }
  }

  return (
    <div className="card" style={{display:"flex",flexDirection:"column",gap:14}}>
      <div className="field" style={{marginBottom:0}}>
        <label>Audience</label>
        <select className="field select" value={audience} onChange={e => setAudience(e.target.value)}
          style={{background:"rgba(10,10,10,.6)",border:"1px solid var(--line)",borderRadius:9,padding:"11px 13px",color:"var(--off)",fontFamily:"Inter",fontSize:14,outline:"none"}}>
          <option value="monthly">Monthly — DJ VIC Newsletter</option>
          <option value="weekly">Weekly — Vic Fix</option>
        </select>
      </div>

      <div className="field" style={{marginBottom:0}}>
        <label>Subject line</label>
        <input style={{background:"rgba(10,10,10,.6)",border:"1px solid var(--line)",borderRadius:9,padding:"11px 13px",color:"var(--off)",fontFamily:"Inter",fontSize:14,outline:"none",width:"100%"}}
          placeholder="e.g. June Mix Drop + Goa Dates Inside 🎧"
          value={subject} onChange={e => setSubject(e.target.value)} />
      </div>

      <div className="field" style={{marginBottom:0}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <label style={{margin:0}}>HTML body</label>
          <button className="btn sm" style={{background:"transparent",border:"1px solid var(--line)",color:"var(--grey)",padding:"5px 11px",fontSize:12}}
            onClick={() => setPreview(p => !p)}>
            {preview ? <><EyeOff size={12}/> Edit</> : <><Eye size={12}/> Preview</>}
          </button>
        </div>
        {!preview ? (
          <textarea
            style={{background:"rgba(10,10,10,.6)",border:"1px solid var(--line)",borderRadius:9,padding:"11px 13px",color:"var(--off)",fontFamily:"'Space Mono',monospace",fontSize:12,lineHeight:1.6,outline:"none",width:"100%",minHeight:320,resize:"vertical"}}
            placeholder="Paste your email HTML here…"
            value={html} onChange={e => setHtml(e.target.value)} />
        ) : (
          <div style={{border:"1px solid var(--line)",borderRadius:9,overflow:"hidden",background:"#fff"}}>
            <iframe
              srcDoc={html || "<p style='font-family:sans-serif;padding:24px;color:#555'>Nothing to preview yet.</p>"}
              title="Email preview"
              style={{width:"100%",height:420,border:"none",display:"block"}}
              sandbox="allow-same-origin"
            />
          </div>
        )}
      </div>

      <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
        <button className="btn" onClick={createDraft} disabled={drafting || !subject || !html}>
          {drafting ? <Loader2 size={15} className="spin" /> : <Mail size={15} />}
          {drafting ? "Creating draft…" : "Create Draft"}
        </button>

        {draft && !confirmSend && (
          <button className="btn" style={{background:"rgba(201,168,76,.15)",border:"1px solid var(--gold)",color:"var(--gold)"}}
            onClick={() => setConfirmSend(true)}>
            <Send size={15} /> Send to {draft.recipientCount} subscriber{draft.recipientCount !== 1 ? "s" : ""}
          </button>
        )}

        {draft && confirmSend && (
          <div style={{display:"flex",gap:8,alignItems:"center",background:"rgba(255,59,59,.08)",border:"1px solid rgba(255,59,59,.25)",borderRadius:9,padding:"10px 14px"}}>
            <span style={{fontSize:13,color:"#ff8a8a"}}>Send for real? No undo.</span>
            <button className="btn sm" style={{background:"var(--red)",color:"#fff"}} onClick={sendNow} disabled={sending}>
              {sending ? <Loader2 size={13} className="spin" /> : null} {sending ? "Sending…" : "Yes, Send"}
            </button>
            <button className="btn sm" style={{background:"transparent",border:"1px solid var(--line)",color:"var(--grey)"}}
              onClick={() => setConfirmSend(false)}>Cancel</button>
          </div>
        )}
      </div>

      {draft && (
        <div className="nl-draft-info">
          ✓ Draft broadcast ID: <code style={{fontFamily:"monospace",fontSize:11,color:"var(--gold)"}}>{draft.broadcastId}</code>
        </div>
      )}
    </div>
  );
}

function NLHistory({ showToast }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const h = await authHeader();
      const r = await fetch(`${FN}/newsletter-manager?action=history`, { headers: h });
      const d = await r.json();
      // History = real sends only (hide drafts and any 0-recipient "sent" junk)
      setHistory((d.history ?? []).filter((n) => n.status === "sent" && (n.recipient_count ?? 0) > 0));
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="center"><Loader2 size={20} className="spin" /></div>;
  if (!history.length) return <div className="empty">No newsletters sent yet</div>;

  return (
    <div className="card">
      <div className="nl-table-wrap">
        <table className="nl-table">
          <thead><tr>
            <th>Subject</th><th>Audience</th><th>Status</th><th>Recipients</th><th>Created</th><th>Sent</th>
          </tr></thead>
          <tbody>
            {history.map(n => (
              <tr key={n.id}>
                <td style={{maxWidth:240,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{n.subject}</td>
                <td><span className="nl-badge">{n.audience}</span></td>
                <td><span className={`status ${n.status === "sent" ? "accepted" : "pending"}`}>{n.status}</span></td>
                <td style={{textAlign:"center"}}>{n.recipient_count}</td>
                <td style={{color:"var(--grey)",fontSize:11,whiteSpace:"nowrap"}}>{new Date(n.created_at).toLocaleDateString("en-IN")}</td>
                <td style={{color:"var(--grey)",fontSize:11,whiteSpace:"nowrap"}}>{n.sent_at ? new Date(n.sent_at).toLocaleDateString("en-IN") : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------- shared bits ----------------
const Stat = ({ label, value, hint }) => (<div className="card stat"><strong>{value}</strong><span>{label}</span>{hint && <span style={{ fontSize: "0.7rem", opacity: 0.55, marginTop: 2, lineHeight: 1.3 }}>{hint}</span>}</div>);
const Center = ({ children }) => (<div className="center">{children}</div>);

function Styles() {
  return <style>{`
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600&display=swap');
  .adm{--black:#0A0A0A;--off:#E8E8E0;--gold:#C9A84C;--red:#FF3B3B;--grey:#9a9a92;--line:rgba(232,232,224,0.10);--panel:rgba(232,232,224,0.03);
    background:var(--black);color:var(--off);font-family:'Inter',sans-serif;min-height:100vh;}
  .adm *{box-sizing:border-box;}
  .adm-top{display:flex;align-items:center;justify-content:space-between;padding:14px 22px;border-bottom:1px solid var(--line);position:sticky;top:0;background:rgba(10,10,10,.9);backdrop-filter:blur(10px);z-index:20;}
  .brand{display:flex;flex-direction:column;line-height:.95;}.brand.center{align-items:center;margin-bottom:22px;}
  .bm{font-family:'Bebas Neue';font-size:24px;letter-spacing:2px;}.bs{font-size:9px;letter-spacing:3px;color:var(--grey);}
  .logout{display:flex;align-items:center;gap:6px;background:transparent;border:1px solid var(--line);color:var(--grey);border-radius:8px;padding:8px 12px;font-size:13px;cursor:pointer;}
  .logout:hover{border-color:var(--red);color:#ff8a8a;}
  .adm-nav{display:flex;gap:6px;padding:14px 22px;border-bottom:1px solid var(--line);overflow-x:auto;}
  .navb{display:flex;align-items:center;gap:7px;background:transparent;border:1px solid var(--line);color:var(--grey);border-radius:999px;padding:9px 15px;font-size:13px;font-weight:500;cursor:pointer;white-space:nowrap;transition:.15s;}
  .navb:hover{color:var(--off);border-color:var(--gold);}
  .navb.on{background:var(--gold);color:var(--black);border-color:var(--gold);font-weight:600;}
  .adm-main{max-width:920px;margin:0 auto;padding:30px 22px 80px;}
  .h1{font-family:'Bebas Neue';font-size:42px;letter-spacing:1px;margin:0 0 20px;}
  .sub{color:var(--grey);font-size:13px;margin:0 0 20px;}
  .row-between{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;}
  .cards{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:20px;margin-bottom:16px;}
  .card-h{font-size:13px;letter-spacing:1px;text-transform:uppercase;color:var(--grey);margin:0 0 16px;}
  .stat{display:flex;flex-direction:column;gap:6px;padding:18px;}
  .stat strong{font-family:'Bebas Neue';font-size:38px;line-height:1;}
  .stat span{font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--grey);}
  .center{display:flex;align-items:center;justify-content:center;gap:8px;color:var(--grey);padding:50px;}
  .chips{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;}
  .chip{background:transparent;border:1px solid var(--line);border-radius:999px;color:var(--grey);font-size:12px;padding:7px 14px;cursor:pointer;text-transform:capitalize;}
  .chip.on{background:var(--gold);border-color:var(--gold);color:var(--black);font-weight:600;}
  .list{display:flex;flex-direction:column;gap:12px;}
  .req{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:18px;}
  .req.accepted{border-color:rgba(201,168,76,.28);}
  .req-top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;}
  .req-top h3{margin:0 0 8px;font-size:16px;font-weight:600;display:flex;align-items:center;gap:8px;}
  .mini{font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--grey);background:rgba(232,232,224,.06);padding:2px 7px;border-radius:5px;}
  .req-meta{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:0;font-size:12px;color:var(--grey);}
  .req-meta span{display:flex;align-items:center;gap:4px;}.gold{color:var(--gold);font-weight:600;}
  .tag{background:rgba(201,168,76,.12);color:var(--gold);padding:2px 9px;border-radius:999px;text-transform:capitalize;}
  .status{font-size:11px;letter-spacing:1px;text-transform:uppercase;padding:4px 10px;border-radius:999px;white-space:nowrap;}
  .status.pending{background:rgba(201,168,76,.12);color:var(--gold);}
  .status.accepted{background:rgba(60,200,120,.12);color:#5fd99a;}
  .status.declined{background:rgba(255,59,59,.12);color:#ff8a8a;}
  .req-msg{color:var(--off);font-size:13px;line-height:1.5;margin:12px 0;opacity:.85;}
  .note{display:flex;gap:8px;margin:10px 0;}
  .note input{flex:1;background:rgba(10,10,10,.6);border:1px solid var(--line);border-radius:8px;padding:8px 12px;color:var(--off);font-size:12px;outline:none;}
  .note-save{background:var(--gold);color:#000;border:none;border-radius:8px;padding:0 14px;font-size:12px;font-weight:600;cursor:pointer;}
  .req-actions{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;}
  .act{display:flex;align-items:center;gap:6px;border:none;border-radius:8px;padding:9px 15px;font-size:12px;font-weight:600;cursor:pointer;font-family:'Inter';}
  .act:disabled{opacity:.6;}
  .act.accept{background:var(--gold);color:#000;}
  .act.decline{background:transparent;border:1px solid var(--line);color:var(--grey);}
  .act.decline:hover{border-color:var(--red);color:#ff8a8a;}
  .act.wa{background:rgba(60,200,120,.12);color:#5fd99a;}
  .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;background:var(--gold);color:#000;border:none;border-radius:9px;padding:13px 20px;font-size:14px;font-weight:600;cursor:pointer;font-family:'Inter';}
  .btn:disabled{opacity:.6;}.btn.sm{padding:9px 15px;font-size:13px;}
  .field{display:flex;flex-direction:column;gap:7px;margin-bottom:12px;}
  .field label{font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--grey);}
  .field input,.field select,.field textarea{background:rgba(10,10,10,.6);border:1px solid var(--line);border-radius:9px;padding:11px 13px;color:var(--off);font-family:'Inter';font-size:14px;outline:none;}
  .field input:focus,.field select:focus,.field textarea:focus{border-color:var(--gold);}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
  .ranklist{display:flex;flex-direction:column;gap:11px;padding:4px 2px;}
  .rankrow{display:grid;grid-template-columns:1fr 90px 34px;align-items:center;gap:10px;font-size:12px;}
  .rl-label{color:var(--off);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .rl-bar{height:6px;background:rgba(232,232,224,.08);border-radius:3px;overflow:hidden;}
  .rl-bar span{display:block;height:100%;background:#C9A84C;border-radius:3px;}
  .rl-val{text-align:right;color:var(--grey);}
  .search{width:100%;background:rgba(10,10,10,.6);border:1px solid var(--line);border-radius:9px;padding:10px 14px;color:var(--off);font-family:inherit;font-size:13px;outline:none;margin:14px 0 4px;}
  .search:focus{border-color:var(--gold);}
  .media-move{position:absolute;top:6px;left:6px;display:flex;gap:4px;}
  .media-move button{background:rgba(0,0,0,.55);border:none;color:#fff;width:24px;height:24px;border-radius:6px;cursor:pointer;font-size:13px;line-height:1;display:flex;align-items:center;justify-content:center;}
  .media-move button:hover{background:rgba(201,168,76,.85);color:#0a0a0a;}
  .pi-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px;}
  .pi-card{background:rgba(232,232,224,.03);border:1px solid var(--line);border-radius:12px;overflow:hidden;display:flex;flex-direction:column;}
  .pi-thumb{position:relative;aspect-ratio:16/9;background:#111;display:flex;align-items:center;justify-content:center;overflow:hidden;}
  .pi-thumb img{width:100%;height:100%;object-fit:cover;display:block;}
  .pi-tag{position:absolute;bottom:6px;left:6px;background:rgba(0,0,0,.62);color:#fff;font-size:9px;padding:2px 7px;border-radius:4px;letter-spacing:1px;text-transform:uppercase;}
  .pi-info{padding:10px 12px 0;display:flex;flex-direction:column;gap:2px;}
  .pi-info strong{font-size:13px;}
  .pi-page{font-size:11px;color:var(--grey);}
  .pi-size{font-size:10.5px;color:var(--gold);letter-spacing:.3px;margin-top:1px;}
  .mini-sel{background:rgba(10,10,10,.6);border:1px solid var(--line);border-radius:6px;color:var(--off);font-family:inherit;font-size:11px;padding:4px 8px;cursor:pointer;outline:none;}
  .mini-sel:focus{border-color:var(--gold);}
  .pi-actions{padding:10px 12px 12px;display:flex;gap:8px;margin-top:auto;}
  .btn.sm.ghost{background:transparent;border:1px solid var(--line);color:var(--grey);}
  .btn.sm.ghost:hover{border-color:var(--gold);color:var(--gold);}
  .grid2-wide{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
  .entry{display:flex;flex-direction:column;}
  .check{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--grey);margin:6px 0 14px;cursor:pointer;}
  .mnav{display:flex;align-items:center;gap:10px;font-weight:600;}
  .mnav button{background:var(--panel);border:1px solid var(--line);color:var(--off);border-radius:8px;width:32px;height:32px;cursor:pointer;font-size:16px;}
  .cal-head,.cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;}
  .cal-head span{text-align:center;font-size:11px;color:var(--grey);padding-bottom:6px;}
  .cc{aspect-ratio:1;border-radius:8px;border:1px solid var(--line);background:transparent;color:var(--off);font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:.15s;}
  .cc.empty{border:none;cursor:default;}
  .cc.open:hover{border-color:var(--gold);color:var(--gold);}
  .cc.blocked{background:rgba(232,232,224,.10);color:var(--grey);}
  .cc.held{background:rgba(201,168,76,.14);color:var(--gold);border-color:rgba(201,168,76,.3);cursor:not-allowed;}
  .cc.booked{background:rgba(255,59,59,.10);color:#ff8a8a;border-color:rgba(255,59,59,.28);cursor:not-allowed;}
  .cc.busy{background:rgba(110,150,230,.14);color:#9bb4ee;border-color:rgba(110,150,230,.3);cursor:not-allowed;}
  .legend{display:flex;gap:16px;margin-top:16px;font-size:11px;color:var(--grey);flex-wrap:wrap;}
  .legend span{display:flex;align-items:center;gap:6px;}
  .dot{width:9px;height:9px;border-radius:3px;}.dot.open{border:1px solid var(--gold);}.dot.blocked{background:rgba(232,232,224,.4);}.dot.held{background:rgba(201,168,76,.5);}.dot.booked{background:rgba(255,59,59,.5);}.dot.busy{background:rgba(110,150,230,.5);}
  .upload-card{display:flex;flex-direction:column;gap:14px;}
  .media-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;}
  .media-cell{position:relative;border-radius:10px;overflow:hidden;border:1px solid var(--line);aspect-ratio:1;}
  .media-cell img,.media-cell video{width:100%;height:100%;object-fit:cover;display:block;}
  .media-cell .vplay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:1.4rem;color:#fff;text-shadow:0 2px 8px rgba(0,0,0,.7);pointer-events:none;}
  .media-kind{position:absolute;top:8px;left:8px;background:rgba(0,0,0,.6);color:var(--off);font-size:10px;padding:2px 8px;border-radius:5px;text-transform:capitalize;}
  .media-del{position:absolute;top:8px;right:8px;background:rgba(255,59,59,.85);color:#fff;border:none;border-radius:6px;padding:5px;cursor:pointer;display:flex;}
  .stars{display:flex;gap:4px;}.stars.sm{gap:2px;}
  .seo{width:100%;border-collapse:collapse;font-size:13px;}
  .seo th{text-align:left;color:var(--grey);font-size:10px;letter-spacing:1px;text-transform:uppercase;padding:6px 8px;border-bottom:1px solid var(--line);}
  .seo td{padding:8px;border-bottom:1px solid rgba(232,232,224,.05);}
  .seo td.ellip{max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .empty{color:var(--grey);font-size:13px;text-align:center;padding:30px;}
  .nl-tabs{display:flex;gap:8px;margin-bottom:16px;}
  .nl-tab{display:flex;align-items:center;gap:6px;background:var(--panel);border:1px solid var(--line);border-radius:9px;color:var(--grey);font-size:13px;font-family:inherit;padding:9px 16px;cursor:pointer;}
  .nl-tab.on{background:rgba(201,168,76,.12);border-color:rgba(201,168,76,.3);color:var(--gold);}
  .nl-aud-bar{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px;}
  .nl-aud-pills{display:flex;gap:8px;}
  .nl-aud-pill{font-size:11px;padding:3px 10px;border-radius:999px;font-weight:600;}
  .nl-aud-pill.ok{background:rgba(60,200,120,.12);color:#5fd99a;}
  .nl-aud-pill.missing{background:rgba(255,59,59,.10);color:#ff8a8a;}
  .nl-add-row{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;}
  .nl-inp{flex:1;min-width:140px;background:rgba(10,10,10,.6);border:1px solid var(--line);border-radius:8px;padding:9px 12px;color:var(--off);font-family:inherit;font-size:13px;outline:none;}
  .nl-inp:focus{border-color:var(--gold);}
  .nl-sel{background:rgba(10,10,10,.6);border:1px solid var(--line);border-radius:8px;color:var(--off);font-family:inherit;font-size:13px;padding:9px 12px;cursor:pointer;outline:none;}
  .nl-sel:focus{border-color:var(--gold);}
  .nl-search-row{display:flex;align-items:center;gap:12px;margin-bottom:10px;}
  .nl-count{font-size:11px;color:var(--grey);white-space:nowrap;}
  .nl-table-wrap{overflow-x:auto;}
  .nl-table{width:100%;border-collapse:collapse;font-size:13px;}
  .nl-table th{text-align:left;color:var(--grey);font-size:10px;letter-spacing:1px;text-transform:uppercase;padding:6px 10px;border-bottom:1px solid var(--line);}
  .nl-table td{padding:9px 10px;border-bottom:1px solid rgba(232,232,224,.04);}
  .nl-table tr.nl-unsub td{opacity:.5;}
  .nl-badge{background:rgba(201,168,76,.10);color:var(--gold);font-size:10px;padding:2px 8px;border-radius:999px;font-weight:600;text-transform:capitalize;}
  .nl-del{background:transparent;border:none;color:var(--grey);cursor:pointer;padding:4px;border-radius:5px;display:flex;}
  .nl-del:hover{color:#ff8a8a;}
  .nl-draft-info{font-size:12px;color:var(--grey);padding:10px 14px;background:rgba(232,232,224,.04);border-radius:9px;border:1px solid var(--line);}
  .login-wrap{display:flex;align-items:center;justify-content:center;min-height:100vh;padding:22px;}
  .login{width:100%;max-width:360px;}
  .toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--gold);color:#000;font-weight:600;font-size:13px;padding:12px 20px;border-radius:10px;z-index:90;max-width:90vw;text-align:center;}
  .spin{animation:sp 1s linear infinite;}@keyframes sp{to{transform:rotate(360deg);}}
  @media(max-width:620px){.cards{grid-template-columns:repeat(2,1fr);}.grid2,.grid2-wide{grid-template-columns:1fr;}}
  `}</style>;
}
