import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import { ResponsiveContainer, BarChart, Bar, XAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import {
  LayoutDashboard, CalendarDays, Image as ImageIcon, Images, Quote, TrendingUp, ClipboardList,
  CheckCircle2, XCircle, Clock, MapPin, Plus, Trash2, LogOut, Loader2, Upload,
  MessageCircle, Star, Ban, Mail, Send, Users, History, Eye, EyeOff,
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
const EVENT_TYPES = ["sangeet", "nightlife", "private", "festival"];
const BUDGETS = ["Under ₹50k", "₹50k – ₹1L", "₹1L – ₹2L", "₹2L+"];
const pad = (n) => String(n).padStart(2, "0");
const ymd = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const waDigits = (s) => (s || "").replace(/[^0-9]/g, "");
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
    ["bookings", "Bookings", ClipboardList],
    ["events", "Events", Star],
    ["guests", "Guests", Users],
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
        {tab === "bookings" && <Bookings showToast={showToast} />}
        {tab === "events" && <EventsAdmin showToast={showToast} />}
        {tab === "guests" && <Guests showToast={showToast} />}
        {tab === "calendar" && <CalendarTab showToast={showToast} />}
        {tab === "media" && <Media showToast={showToast} />}
        {tab === "pageimages" && <PageImages showToast={showToast} />}
        {tab === "testimonials" && <Testimonials showToast={showToast} />}
        {tab === "marketing" && <Marketing />}
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
    const newWeek = bookings.filter((b) => now - new Date(b.created_at).getTime() < WEEK).length;
    const leads30 = bookings.filter((b) => now - new Date(b.created_at).getTime() < 30 * DAY).length;
    const pending = bookings.filter((b) => b.status === "pending").length;
    const accepted = bookings.filter((b) => b.status === "accepted").length;
    const conv = bookings.length ? Math.round((accepted / bookings.length) * 100) : 0;
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
      const c = bookings.filter((b) => { const x = new Date(b.created_at).getTime(); return x >= start && x < end; }).length;
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
  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all"); const [acting, setActing] = useState(null);
  const [adding, setAdding] = useState(false); const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("bookings").select("*").order("created_at", { ascending: false });
    setRows(data || []); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const decide = async (id, status) => {
    setActing(id);
    const res = await fetch(`${FN}/calendar-sync?action=${status === "accepted" ? "confirm" : "release"}`, {
      method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ bookingId: id }),
    }).then((r) => r.json()).catch(() => ({ error: "Network error" }));
    setActing(null);
    if (res.error) return showToast(res.error);
    showToast(status === "accepted" ? "Confirmed — on your calendar." : "Declined.");
    load();
  };

  const saveNote = async (id, notes) => {
    await supabase.from("bookings").update({ notes }).eq("id", id);
  };

  const whatsapp = (r) => {
    const num = waDigits(r.contact);
    const msg = encodeURIComponent(`Hi ${r.name}, this is Vic — thanks for your booking request for ${r.event_date}. `);
    if (num.length >= 10) window.open(`https://wa.me/${num}?text=${msg}`, "_blank");
    else window.open(`mailto:${r.contact}?subject=Your booking request&body=${msg}`, "_blank");
  };

  const q = query.trim().toLowerCase();
  const filtered = rows
    .filter((r) => (filter === "all" ? true : r.status === filter))
    .filter((r) => !q || [r.name, r.contact, r.city, r.venue, r.event_type].some((v) => (v || "").toLowerCase().includes(q)));

  const exportCsv = () => {
    const cols = ["created_at", "status", "name", "contact", "event_type", "event_date", "venue", "city", "budget", "message"];
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [cols.join(","), ...filtered.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `djvic-bookings-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <>
      <div className="row-between">
        <h1 className="h1">Bookings</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn sm" onClick={exportCsv}>Export CSV</button>
          <button className="btn sm" onClick={() => setAdding((v) => !v)}><Plus size={15} /> Log a gig</button>
        </div>
      </div>

      {adding && <ManualEntry onDone={() => { setAdding(false); load(); }} showToast={showToast} />}

      <div className="chips">
        {["all", "pending", "accepted", "declined"].map((f) => (
          <button key={f} className={filter === f ? "chip on" : "chip"} onClick={() => setFilter(f)}>{f}</button>
        ))}
      </div>
      <input className="search" placeholder="Search name, contact, city…" value={query} onChange={(e) => setQuery(e.target.value)} />

      {loading ? <Center><Loader2 className="spin" size={18} /></Center> : (
        <div className="list">
          {filtered.length === 0 && <p className="empty">Nothing here.</p>}
          {filtered.map((r) => {
            const d = new Date(r.event_date);
            return (
              <div key={r.id} className={`req ${r.status}`}>
                <div className="req-top">
                  <div>
                    <h3>{r.name} {r.source === "manual" && <span className="mini">manual</span>}</h3>
                    <p className="req-meta">
                      <span className="tag">{r.event_type}</span>
                      <span>{MONTHS[d.getMonth()]} {d.getDate()}</span>
                      <span><MapPin size={12} /> {r.venue || "—"}, {r.city || "—"}</span>
                      <span className="gold">{r.budget || "—"}</span>
                    </p>
                  </div>
                  <span className={`status ${r.status}`}>{r.status}</span>
                </div>
                {r.message && <p className="req-msg">{r.message}</p>}
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
                  <button className="act wa" onClick={() => whatsapp(r)}><MessageCircle size={15} /> Reply</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
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

  if (editing) return <EventForm event={editing === "new" ? null : editing} onDone={() => { setEditing(null); load(); }} showToast={showToast} />;
  if (viewing) return <EventDetail event={viewing} onBack={() => { setViewing(null); load(); }} showToast={showToast} />;

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
        <button className="act" onClick={() => setEditing(ev)}>Edit</button>
        <button className="act" onClick={() => toggleGl(ev)}>{ev.guestlist_enabled ? "Disable RSVP" : "Enable RSVP"}</button>
        <button className={ev.active ? "act decline" : "act accept"} onClick={() => setLive(ev, !ev.active)}>
          {ev.active ? "Take off site" : "Set live"}
        </button>
      </div>
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
  const [tab, setTab] = useState("list");
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
        <p className="sub" style={{ margin: 0 }}>RSVPs from the homepage popup.</p>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn sm" onClick={sendListToWhatsApp}><MessageCircle size={15} /> WhatsApp list</button>
          <button className="btn sm" onClick={exportCsv}>Export CSV</button>
        </div>
      </div>
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
                    <h3>{r.name} <span className="gold">· {r.guests} {Number(r.guests) === 1 ? "guest" : "guests"}</span></h3>
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

function NoteField({ initial, onSave }) {
  const [val, setVal] = useState(initial); const [dirty, setDirty] = useState(false);
  return (
    <div className="note">
      <input value={val} placeholder="Private note…" onChange={(e) => { setVal(e.target.value); setDirty(true); }} />
      {dirty && <button className="note-save" onClick={() => { onSave(val); setDirty(false); }}>Save</button>}
    </div>
  );
}

function ManualEntry({ onDone, showToast }) {
  const [f, setF] = useState({ name: "", contact: "", event_type: "private", event_date: "", venue: "", city: "", budget: BUDGETS[1], confirmed: true });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!f.name || !f.event_date) return showToast("Name and date required.");
    setBusy(true);
    const { data, error } = await supabase.from("bookings").insert({
      name: f.name, contact: f.contact || "—", event_type: f.event_type, event_date: f.event_date,
      venue: f.venue, city: f.city, budget: f.budget, source: "manual",
      status: f.confirmed ? "accepted" : "pending",
    }).select().single();
    if (error) { setBusy(false); return showToast(error.message); }
    if (f.confirmed && data?.id) {
      await fetch(`${FN}/calendar-sync?action=confirm`, {
        method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ bookingId: data.id }),
      }).catch(() => {});
    }
    setBusy(false); showToast("Gig logged."); onDone();
  };
  return (
    <div className="card entry">
      <div className="grid2">
        <div className="field"><label>Client / venue</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="field"><label>Contact</label><input value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} /></div>
        <div className="field"><label>Type</label><select value={f.event_type} onChange={(e) => setF({ ...f, event_type: e.target.value })}>{EVENT_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
        <div className="field"><label>Date</label><input type="date" value={f.event_date} onChange={(e) => setF({ ...f, event_date: e.target.value })} /></div>
        <div className="field"><label>Venue</label><input value={f.venue} onChange={(e) => setF({ ...f, venue: e.target.value })} /></div>
        <div className="field"><label>City</label><input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></div>
      </div>
      <label className="check"><input type="checkbox" checked={f.confirmed} onChange={(e) => setF({ ...f, confirmed: e.target.checked })} /> Already confirmed — add to my calendar</label>
      <button className="btn" onClick={save} disabled={busy}>{busy ? <Loader2 className="spin" size={16} /> : "Save gig"}</button>
    </div>
  );
}

// ---------------- CALENDAR (block dates) ----------------
function CalendarTab({ showToast }) {
  const today = useMemo(() => new Date(), []);
  const [cur, setCur] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [map, setMap] = useState({});
  const [loading, setLoading] = useState(true);

  const dim = new Date(cur.y, cur.m + 1, 0).getDate();
  const fw = new Date(cur.y, cur.m, 1).getDay();

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

  return (
    <>
      <div className="row-between">
        <h1 className="h1">Calendar</h1>
        <div className="mnav">
          <button onClick={() => setCur((c) => { const d = new Date(c.y, c.m - 1, 1); return { y: d.getFullYear(), m: d.getMonth() }; })}>‹</button>
          <span>{MONTHS[cur.m]} {cur.y}</span>
          <button onClick={() => setCur((c) => { const d = new Date(c.y, c.m + 1, 1); return { y: d.getFullYear(), m: d.getMonth() }; })}>›</button>
        </div>
      </div>
      <p className="sub">Tap a night to block / unblock it. Booked & held nights are managed in Bookings.</p>
      <div className="card">
        {loading && <Center><Loader2 className="spin" size={16} /></Center>}
        <div className="cal-head">{["S","M","T","W","T","F","S"].map((d, i) => <span key={i}>{d}</span>)}</div>
        <div className="cal-grid">
          {Array.from({ length: fw }).map((_, i) => <span key={`b${i}`} className="cc empty" />)}
          {Array.from({ length: dim }).map((_, i) => {
            const day = i + 1; const st = map[ymd(cur.y, cur.m, day)] || "open";
            return <button key={day} className={`cc ${st}`} onClick={() => toggle(day)}>{day}</button>;
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
  const fileRefs = useRef({});

  const load = useCallback(async () => {
    const { data } = await supabase.from("site_images").select("*");
    const m = {}; (data || []).forEach((r) => { m[r.slot] = r; }); setMap(m);
  }, []);
  useEffect(() => { load(); }, [load]);

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
        {IMAGE_SLOTS.map((s) => {
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

// ---------------- MARKETING (GSC) ----------------
function Marketing() {
  const [data, setData] = useState(null); const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      const res = await fetch(`${FN}/admin-api?action=seo-stats`, { method: "POST", headers: await authHeader() })
        .then((r) => r.json()).catch(() => ({ connected: false, reason: "Network error" }));
      setData(res); setLoading(false);
    })();
  }, []);

  if (loading) return <Center><Loader2 className="spin" size={20} /> Pulling Search Console…</Center>;
  if (!data?.connected) return (
    <>
      <h1 className="h1">Marketing</h1>
      <div className="card">
        <p className="sub" style={{ margin: 0 }}>Search Console isn't wired up yet{data?.reason ? ` (${data.reason})` : ""}. Once djvicofficial.com is verified in GSC and the admin-api has the webmasters scope, your top queries and pages show here.</p>
      </div>
    </>
  );

  const t = data.totals || {};
  const pct = (n) => `${((n || 0) * 100).toFixed(1)}%`;
  const stripDomain = (u) => (u || "").replace(/^https?:\/\/[^/]+/, "") || "/";
  // Quick wins: queries ranking page-1-bottom / page-2 with real impressions.
  const opps = [...(data.queries || [])]
    .filter((r) => r.position >= 4 && r.position <= 15 && (r.impressions || 0) > 0)
    .sort((a, b) => b.impressions - a.impressions).slice(0, 6);

  return (
    <>
      <h1 className="h1">Marketing</h1>
      <p className="sub">Search Console · {data.range.from} → {data.range.to}</p>
      <div className="cards">
        <Stat label="Clicks · 28d" value={t.clicks ?? 0} />
        <Stat label="Impressions" value={(t.impressions ?? 0).toLocaleString()} />
        <Stat label="Avg CTR" value={pct(t.ctr)} />
        <Stat label="Avg position" value={(t.position ?? 0).toFixed(1)} />
      </div>

      {opps.length > 0 && (
        <div className="card">
          <h3 className="card-h">Quick-win keywords · ranking 4–15 with traffic</h3>
          <table className="seo">
            <thead><tr><th>Query</th><th>Impr.</th><th>Clicks</th><th>CTR</th><th>Pos.</th></tr></thead>
            <tbody>
              {opps.map((r, i) => (
                <tr key={i}><td className="ellip">{r.key}</td><td>{r.impressions}</td><td>{r.clicks}</td><td>{pct(r.ctr)}</td><td>{r.position?.toFixed(1)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid2-wide">
        <SeoTable title="Top queries" rows={data.queries} keyLabel="Query" />
        <SeoTable title="Top pages" rows={data.pages} keyLabel="Page" transform={stripDomain} />
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
        <thead><tr><th>{keyLabel}</th><th>Clicks</th><th>Impr.</th><th>CTR</th><th>Pos.</th></tr></thead>
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
      setHistory(d.history ?? []);
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
const Stat = ({ label, value }) => (<div className="card stat"><strong>{value}</strong><span>{label}</span></div>);
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
