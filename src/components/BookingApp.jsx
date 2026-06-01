import React, { useState, useEffect, useMemo, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  Calendar, CheckCircle2, XCircle, Clock, MapPin, Music2, Sparkles,
  Disc3, PartyPopper, ArrowRight, ChevronLeft, ChevronRight, LogOut, Loader2,
} from "lucide-react";

// ============================================================
// DJ VIC — Booking Funnel (production / wired)
// Talks to: public_calendar RPC, submit_booking RPC, calendar-sync edge fn.
// Static-deployable: all dynamic work happens in Supabase.
//
// CONFIG — set these as env vars in your project
//   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY  (Astro/Vite)
//   For Next.js, swap to NEXT_PUBLIC_* and read from process.env.
// ============================================================
const SUPABASE_URL = import.meta.env.PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
const EDGE_URL = `${SUPABASE_URL}/functions/v1/calendar-sync`;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const C = { gold: "#C9A84C" };
const EVENT_TYPES = [
  { key: "sangeet", label: "Sangeet", icon: Sparkles },
  { key: "nightlife", label: "Nightlife / Club", icon: Disc3 },
  { key: "private", label: "Private Event", icon: Music2 },
  { key: "festival", label: "Festival", icon: PartyPopper },
];
const BUDGETS = ["Under ₹50k", "₹50k – ₹1L", "₹1L – ₹2L", "₹2L+"];
const SVC_COPY = {
  sangeet: "Wedding sangeet & receptions — Bollywood, desi house, the family floor-fillers.",
  nightlife: "Club & lounge nights — house, techno, commercial. Resident-grade energy.",
  private: "Birthdays, anniversaries, brand parties — read the room, build the arc.",
  festival: "Main-stage and festival slots — big-room, open-format, full production.",
};
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const RANK = { booked: 3, blocked: 2, held: 1 };

const pad = (n) => String(n).padStart(2, "0");
const ymd = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const typeLabel = (k) => EVENT_TYPES.find((t) => t.key === k)?.label ?? k;

// ---------- ntfy.sh push → Vic's phone (same private topic as the main site) ----------
// /book is standalone (no Layout.astro), so it doesn't inherit the site's Formspree→ntfy
// bridge. We fire the push here, on a successful booking, in the same style.
const NTFY_TOPIC = "djvic-bookings-7k9f3hQ2pX8mN5vR";
function notifyVic({ name, contact, type, dateStr, venue, city, budget, message }) {
  try {
    const title = `New booking request — ${name}`;
    const body =
      `${typeLabel(type)} · ${dateStr}\n` +
      `Contact: ${contact}\n` +
      `Where: ${[venue, city].filter(Boolean).join(", ") || "—"}\n` +
      `Budget: ${budget || "—"}` +
      (message ? `\n\n"${message}"` : "");
    const url = `https://ntfy.sh/${NTFY_TOPIC}` +
      `?title=${encodeURIComponent(title)}&priority=4&tags=studio_microphone,headphone`;
    navigator.sendBeacon(url, new Blob([body], { type: "text/plain" }));
  } catch (_) {
    // never block the booking on a notification failure
  }
}

export default function App() {
  // The Booth (the old in-app admin) was retired — the full admin now lives at
  // /admin. Any legacy ?admin / #dashboard link redirects there.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("admin") || window.location.hash === "#dashboard") {
      window.location.replace("/admin");
    }
  }, []);
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [avail, setAvail] = useState({});
  const [loadingCal, setLoadingCal] = useState(true);
  const [toast, setToast] = useState(null);
  const [session, setSession] = useState(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3400); };

  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const firstWeekday = new Date(cursor.y, cursor.m, 1).getDay();

  const loadAvailability = useCallback(async (y, m) => {
    setLoadingCal(true);
    const dim = new Date(y, m + 1, 0).getDate();
    const from = ymd(y, m, 1);
    const to = ymd(y, m, dim);
    const [rpc, busy] = await Promise.all([
      supabase.rpc("public_calendar", { p_from: from, p_to: to }),
      fetch(`${EDGE_URL}?action=availability&from=${from}&to=${to}`)
        .then((r) => r.json()).catch(() => ({ busy: [] })),
    ]);
    const map = {};
    (rpc.data || []).forEach((row) => {
      const prev = map[row.the_date];
      if (!prev || RANK[row.state] > RANK[prev]) map[row.the_date] = row.state;
    });
    (busy.busy || []).forEach((d) => {
      if (!map[d] || RANK.blocked > RANK[map[d]]) map[d] = "blocked";
    });
    setAvail(map);
    setLoadingCal(false);
  }, []);

  useEffect(() => { loadAvailability(cursor.y, cursor.m); }, [cursor, loadAvailability]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const shiftMonth = (dir) => {
    setCursor((c) => {
      const d = new Date(c.y, c.m + dir, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  };

  const isPast = (day) => {
    const d = new Date(cursor.y, cursor.m, day);
    const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return d < t;
  };
  const dateStatus = (day) => {
    if (isPast(day)) return "past";
    return avail[ymd(cursor.y, cursor.m, day)] || "open";
  };

  return (
    <div className="vic-root">
      <style>{styles}</style>

      <ClientFunnel
        cursor={cursor} shiftMonth={shiftMonth} daysInMonth={daysInMonth}
        firstWeekday={firstWeekday} dateStatus={dateStatus} loadingCal={loadingCal}
        reload={() => loadAvailability(cursor.y, cursor.m)} showToast={showToast}
      />

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

// ------------------------------------------------------------
function ClientFunnel({ cursor, shiftMonth, daysInMonth, firstWeekday, dateStatus, loadingCal, reload, showToast }) {
  const [form, setForm] = useState({
    name: "", contact: "", type: "nightlife", day: null,
    venue: "", city: "", budget: BUDGETS[1], message: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const pickDate = (day) => {
    if (dateStatus(day) !== "open") return;
    setForm((f) => ({ ...f, day }));
    document.getElementById("request")?.scrollIntoView({ behavior: "smooth" });
  };

  const submit = async () => {
    if (!form.name || !form.contact || !form.day) {
      showToast("Add your name, contact, and pick an available date."); return;
    }
    setSubmitting(true);
    const { error } = await supabase.rpc("submit_booking", {
      p_name: form.name, p_contact: form.contact, p_event_type: form.type,
      p_event_date: ymd(cursor.y, cursor.m, form.day),
      p_venue: form.venue || null, p_city: form.city || null,
      p_budget: form.budget, p_message: form.message || null,
    });
    setSubmitting(false);
    if (error) { showToast(error.message || "Could not send request."); return; }
    notifyVic({
      name: form.name, contact: form.contact, type: form.type,
      dateStr: `${MONTHS[cursor.m]} ${form.day}, ${cursor.y}`,
      venue: form.venue, city: form.city, budget: form.budget, message: form.message,
    });
    showToast(`Request sent for ${MONTHS[cursor.m]} ${form.day}. Vic will confirm soon.`);
    setForm({ name: "", contact: "", type: "nightlife", day: null, venue: "", city: "", budget: BUDGETS[1], message: "" });
    reload();
  };

  return (
    <main>
      <section className="hero">
        <div className="hero-glow" /><div className="hero-grain" />
        <div className="hero-inner">
          <p className="kicker fade" style={{ animationDelay: ".05s" }}>International DJ · Based in Bangalore</p>
          <h1 className="hero-title fade" style={{ animationDelay: ".15s" }}>BOOK<br /><span className="hero-title-gold">DJ VIC</span></h1>
          <p className="hero-line fade" style={{ animationDelay: ".28s" }}>
            <em>Nineteen years behind the decks.</em> Eighteen countries.<br />
            One booking away from your dancefloor.
          </p>
          <div className="hero-cta fade" style={{ animationDelay: ".4s" }}>
            <a href="#availability" className="btn-primary">Check a date <ArrowRight size={16} /></a>
            <a href="#services" className="btn-ghost">What I play</a>
          </div>
        </div>
      </section>

      <section id="services" className="block">
        <h2 className="block-h">The sets</h2>
        <p className="block-sub">Pick what fits the room.</p>
        <div className="svc-grid">
          {EVENT_TYPES.map((t) => {
            const Icon = t.icon;
            return (
              <div key={t.key} className="svc-card">
                <Icon size={22} style={{ color: C.gold }} />
                <h3>{t.label}</h3><p>{SVC_COPY[t.key]}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section id="availability" className="block">
        <h2 className="block-h">Availability</h2>
        <div className="cal-topline">
          <p className="block-sub" style={{ margin: 0 }}>Tap an open night to start a request.</p>
          <div className="month-nav">
            <button onClick={() => shiftMonth(-1)}><ChevronLeft size={16} /></button>
            <span>{MONTHS[cursor.m]} {cursor.y}</span>
            <button onClick={() => shiftMonth(1)}><ChevronRight size={16} /></button>
          </div>
        </div>
        <div className="cal-wrap">
          {loadingCal && <div className="cal-loading"><Loader2 className="spin" size={18} /> syncing calendar…</div>}
          <div className="cal-head">{["S","M","T","W","T","F","S"].map((d, i) => <span key={i} className="cal-dow">{d}</span>)}</div>
          <div className="cal-grid">
            {Array.from({ length: firstWeekday }).map((_, i) => <span key={`b${i}`} className="cal-cell empty" />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const st = dateStatus(day);
              const selected = form.day === day;
              return (
                <button key={day} className={`cal-cell ${st} ${selected ? "sel" : ""}`}
                  onClick={() => pickDate(day)} disabled={st !== "open"}>{day}</button>
              );
            })}
          </div>
          <div className="legend">
            <span><i className="dot open" /> Open</span>
            <span><i className="dot held" /> On hold</span>
            <span><i className="dot booked" /> Booked / busy</span>
          </div>
        </div>
      </section>

      <section id="request" className="block">
        <h2 className="block-h">Send a request</h2>
        <p className="block-sub">
          {form.day ? `Holding ${MONTHS[cursor.m]} ${form.day} while we sort the details.` : "Pick a date above, then tell me about the night."}
        </p>
        <div className="form">
          <div className="field-row">
            <div className="field"><label>Your name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name / venue" /></div>
            <div className="field"><label>Phone or email</label>
              <input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="So I can confirm" /></div>
          </div>
          <div className="field"><label>Type of set</label>
            <div className="chips">
              {EVENT_TYPES.map((t) => (
                <button key={t.key} className={form.type === t.key ? "chip on" : "chip"} onClick={() => setForm({ ...form, type: t.key })}>{t.label}</button>
              ))}
            </div>
          </div>
          <div className="field-row">
            <div className="field"><label>Venue</label>
              <input value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} placeholder="Where's the party?" /></div>
            <div className="field"><label>City</label>
              <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="City" /></div>
          </div>
          <div className="field-row">
            <div className="field"><label>Date</label>
              <div className="date-pill">{form.day ? `${MONTHS[cursor.m]} ${form.day}, ${cursor.y}` : "— pick above —"}</div></div>
            <div className="field"><label>Budget</label>
              <select value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })}>
                {BUDGETS.map((b) => <option key={b}>{b}</option>)}
              </select></div>
          </div>
          <div className="field"><label>Anything else</label>
            <textarea rows={3} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Guest count, vibe, timings, special requests…" /></div>
          <button className="btn-primary big" onClick={submit} disabled={submitting}>
            {submitting ? <><Loader2 className="spin" size={16} /> Sending…</> : <>Send booking request <ArrowRight size={16} /></>}
          </button>
        </div>
      </section>

    </main>
  );
}

// ------------------------------------------------------------
function AdminDash({ session, showToast, reloadCal, onExit }) {
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [requests, setRequests] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [actingId, setActingId] = useState(null);

  const login = async () => {
    setAuthBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pwd });
    setAuthBusy(false);
    if (error) showToast(error.message);
  };
  const logout = () => supabase.auth.signOut();

  const loadBookings = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("bookings").select("*").order("created_at", { ascending: false });
    setLoading(false);
    if (!error) setRequests(data || []);
  }, []);

  useEffect(() => { if (session) loadBookings(); }, [session, loadBookings]);

  const decide = async (id, action) => {
    setActingId(id);
    const token = session?.access_token;
    const res = await fetch(`${EDGE_URL}?action=${action === "accepted" ? "confirm" : "release"}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ bookingId: id }),
    }).then((r) => r.json()).catch(() => ({ error: "Network error" }));
    setActingId(null);
    if (res.error) { showToast(res.error); return; }
    showToast(action === "accepted" ? "Confirmed — added to your calendar." : "Declined.");
    loadBookings();
    reloadCal();
  };

  const stats = useMemo(() => ({
    pending: requests.filter((r) => r.status === "pending").length,
    accepted: requests.filter((r) => r.status === "accepted").length,
    booked: requests.filter((r) => r.status === "accepted").length,
  }), [requests]);

  if (!session) {
    return (
      <main className="block" style={{ maxWidth: 420 }}>
        <h2 className="block-h">The Booth 🎧</h2>
        <p className="block-sub">Members only. This is where VIC runs the night.</p>
        <div className="form">
          <div className="field"><label>Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" /></div>
          <div className="field"><label>Password</label>
            <input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="••••••••" /></div>
          <button className="btn-primary big" onClick={login} disabled={authBusy}>
            {authBusy ? <><Loader2 className="spin" size={16} /> Signing in…</> : "Sign in"}
          </button>
          <button className="logout" style={{ alignSelf: "flex-start" }} onClick={onExit}>
            <ChevronLeft size={14} /> Back to booking page
          </button>
        </div>
      </main>
    );
  }

  const filtered = requests.filter((r) => (filter === "all" ? true : r.status === filter));

  return (
    <main className="admin">
      <section className="block">
        <div className="cal-topline">
          <div><h2 className="block-h">The Booth 🎧</h2><p className="block-sub" style={{ margin: "10px 0 0" }}>Incoming requests.</p></div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="logout" onClick={onExit}><ChevronLeft size={14} /> Booking page</button>
            <button className="logout" onClick={logout}><LogOut size={14} /> Sign out</button>
          </div>
        </div>

        <div className="stat-grid" style={{ marginTop: 24 }}>
          <div className="stat"><Clock size={18} style={{ color: C.gold }} /><strong>{stats.pending}</strong><span>Pending</span></div>
          <div className="stat"><CheckCircle2 size={18} style={{ color: C.gold }} /><strong>{stats.accepted}</strong><span>Confirmed</span></div>
          <div className="stat"><Calendar size={18} style={{ color: C.gold }} /><strong>{stats.booked}</strong><span>Booked nights</span></div>
        </div>

        <div className="chips" style={{ marginTop: 24 }}>
          {["all", "pending", "accepted", "declined"].map((f) => (
            <button key={f} className={filter === f ? "chip on" : "chip"} onClick={() => setFilter(f)}>{f[0].toUpperCase() + f.slice(1)}</button>
          ))}
        </div>

        <div className="req-list">
          {loading && <p className="empty"><Loader2 className="spin" size={18} /> Loading…</p>}
          {!loading && filtered.length === 0 && <p className="empty">Nothing here yet.</p>}
          {filtered.map((r) => {
            const d = new Date(r.event_date);
            const dateStr = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
            return (
              <div key={r.id} className={`req ${r.status}`}>
                <div className="req-top">
                  <div>
                    <h3>{r.name}</h3>
                    <p className="req-meta">
                      <span className="tag">{typeLabel(r.event_type)}</span>
                      <span><Calendar size={12} /> {dateStr}</span>
                      <span><MapPin size={12} /> {r.venue || "—"}, {r.city || "—"}</span>
                    </p>
                  </div>
                  <span className={`status ${r.status}`}>
                    {r.status === "pending" && <Clock size={12} />}
                    {r.status === "accepted" && <CheckCircle2 size={12} />}
                    {r.status === "declined" && <XCircle size={12} />}
                    {r.status}
                  </span>
                </div>
                {r.message && <p className="req-msg">{r.message}</p>}
                <div className="req-foot">
                  <span className="req-budget">{r.budget || "—"}</span>
                  <span className="req-contact">{r.contact}</span>
                </div>
                {r.status === "pending" && (
                  <div className="req-actions">
                    <button className="act accept" disabled={actingId === r.id} onClick={() => decide(r.id, "accepted")}>
                      {actingId === r.id ? <Loader2 className="spin" size={15} /> : <CheckCircle2 size={15} />} Confirm
                    </button>
                    <button className="act decline" disabled={actingId === r.id} onClick={() => decide(r.id, "declined")}>
                      <XCircle size={15} /> Decline
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}

const styles = `
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Playfair+Display:ital@1&family=Inter:wght@400;500;600&display=swap');
.vic-root{--black:#0A0A0A;--off:#E8E8E0;--gold:#C9A84C;--red:#FF3B3B;--grey:#9a9a92;--line:rgba(232,232,224,0.10);
  background:var(--black);color:var(--off);font-family:'Inter',sans-serif;min-height:100vh;position:relative;overflow-x:hidden;}
.vic-root *{box-sizing:border-box;}
.topbar{position:sticky;top:0;z-index:40;display:flex;align-items:center;justify-content:space-between;padding:14px 22px;
  background:rgba(10,10,10,0.82);backdrop-filter:blur(12px);border-bottom:1px solid var(--line);}
.brand{display:flex;flex-direction:column;line-height:.95;}
.brand-mark{font-family:'Bebas Neue';font-size:24px;letter-spacing:2px;}
.brand-sub{font-size:9px;letter-spacing:3px;color:var(--grey);}
.toggle{display:flex;gap:4px;background:rgba(232,232,224,0.05);padding:4px;border-radius:999px;border:1px solid var(--line);}
.tg{border:none;background:transparent;color:var(--grey);font-size:12px;font-weight:500;padding:7px 16px;border-radius:999px;cursor:pointer;transition:.2s;}
.tg.on{background:var(--gold);color:var(--black);font-weight:600;}
.hero{position:relative;padding:84px 22px 0;text-align:center;overflow:hidden;}
.hero-glow{position:absolute;top:-180px;left:50%;transform:translateX(-50%);width:680px;height:520px;
  background:radial-gradient(ellipse at center,rgba(201,168,76,0.22),transparent 65%);filter:blur(20px);pointer-events:none;}
.hero-grain{position:absolute;inset:0;opacity:.05;pointer-events:none;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");}
.hero-inner{position:relative;max-width:760px;margin:0 auto;}
.kicker{font-size:12px;letter-spacing:4px;text-transform:uppercase;color:var(--gold);margin:0 0 18px;}
.hero-title{font-family:'Bebas Neue';font-size:clamp(74px,16vw,150px);line-height:.82;margin:0;letter-spacing:1px;}
.hero-title-gold{color:var(--gold);}
.hero-line{font-family:'Playfair Display';font-style:italic;font-size:clamp(16px,2.4vw,21px);color:var(--off);max-width:520px;margin:26px auto 0;line-height:1.5;}
.hero-line em{color:var(--gold);font-style:italic;}
.hero-cta{display:flex;gap:14px;justify-content:center;margin-top:34px;flex-wrap:wrap;}
.btn-primary{display:inline-flex;align-items:center;gap:8px;background:var(--red);color:#fff;text-decoration:none;font-weight:600;font-size:14px;
  padding:13px 24px;border-radius:8px;border:none;cursor:pointer;transition:.2s;box-shadow:0 8px 30px rgba(255,59,59,0.25);}
.btn-primary:hover{transform:translateY(-2px);box-shadow:0 12px 36px rgba(255,59,59,0.35);}
.btn-primary:disabled{opacity:.6;cursor:default;transform:none;}
.btn-primary.big{width:100%;justify-content:center;padding:16px;font-size:15px;margin-top:8px;}
.btn-ghost{display:inline-flex;align-items:center;color:var(--off);text-decoration:none;font-weight:500;font-size:14px;padding:13px 24px;border-radius:8px;border:1px solid var(--line);transition:.2s;}
.btn-ghost:hover{border-color:var(--gold);color:var(--gold);}
.cred-strip{display:flex;align-items:center;justify-content:center;gap:26px;margin:64px auto 0;padding:22px;max-width:560px;border-top:1px solid var(--line);border-bottom:1px solid var(--line);}
.cred{display:flex;flex-direction:column;align-items:center;}
.cred strong{font-family:'Bebas Neue';font-size:30px;color:var(--gold);line-height:1;}
.cred span{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--grey);margin-top:5px;}
.cred-div{width:1px;height:34px;background:var(--line);}
.block{max-width:860px;margin:0 auto;padding:72px 22px 0;}
.block-h{font-family:'Bebas Neue';font-size:clamp(38px,7vw,58px);letter-spacing:1px;margin:0;line-height:.9;}
.block-sub{color:var(--grey);font-size:14px;margin:10px 0 30px;}
.cal-topline{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:24px;flex-wrap:wrap;}
.month-nav{display:flex;align-items:center;gap:10px;font-size:14px;font-weight:600;}
.month-nav button{background:rgba(232,232,224,0.05);border:1px solid var(--line);color:var(--off);border-radius:8px;padding:7px;cursor:pointer;display:flex;transition:.2s;}
.month-nav button:hover{border-color:var(--gold);color:var(--gold);}
.svc-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;}
.svc-card{background:rgba(232,232,224,0.03);border:1px solid var(--line);border-radius:14px;padding:22px;transition:.25s;}
.svc-card:hover{border-color:rgba(201,168,76,0.45);transform:translateY(-3px);background:rgba(201,168,76,0.05);}
.svc-card h3{font-size:17px;margin:14px 0 8px;font-weight:600;}
.svc-card p{color:var(--grey);font-size:13px;line-height:1.55;margin:0;}
.cal-wrap{background:rgba(232,232,224,0.03);border:1px solid var(--line);border-radius:16px;padding:22px;position:relative;}
.cal-loading{position:absolute;top:14px;right:18px;display:flex;align-items:center;gap:7px;font-size:12px;color:var(--gold);}
.cal-head,.cal-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px;}
.cal-dow{text-align:center;font-size:11px;color:var(--grey);letter-spacing:1px;padding-bottom:8px;}
.cal-cell{aspect-ratio:1;border-radius:10px;border:1px solid var(--line);background:transparent;color:var(--off);font-size:14px;font-weight:500;cursor:pointer;transition:.18s;display:flex;align-items:center;justify-content:center;}
.cal-cell.empty{border:none;background:transparent;cursor:default;}
.cal-cell.past{opacity:.25;cursor:not-allowed;}
.cal-cell.open:hover{border-color:var(--gold);background:rgba(201,168,76,0.12);color:var(--gold);}
.cal-cell.held{background:rgba(201,168,76,0.14);border-color:rgba(201,168,76,0.3);color:var(--gold);cursor:not-allowed;}
.cal-cell.blocked{background:rgba(232,232,224,0.06);border-color:var(--line);color:var(--grey);cursor:not-allowed;}
.cal-cell.booked{background:rgba(255,59,59,0.10);border-color:rgba(255,59,59,0.28);color:#ff8a8a;cursor:not-allowed;text-decoration:line-through;}
.cal-cell.sel{background:var(--gold);color:var(--black);border-color:var(--gold);font-weight:700;}
.legend{display:flex;gap:20px;margin-top:18px;font-size:12px;color:var(--grey);flex-wrap:wrap;}
.legend span{display:flex;align-items:center;gap:7px;}
.dot{width:10px;height:10px;border-radius:3px;display:inline-block;}
.dot.open{border:1px solid var(--gold);}
.dot.held{background:rgba(201,168,76,0.5);}
.dot.booked{background:rgba(255,59,59,0.5);}
.form{background:rgba(232,232,224,0.03);border:1px solid var(--line);border-radius:16px;padding:26px;display:flex;flex-direction:column;gap:18px;}
.field-row{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
.field{display:flex;flex-direction:column;gap:8px;}
.field label{font-size:11px;letter-spacing:2px;text-transform:uppercase;color:var(--grey);}
.field input,.field select,.field textarea{background:rgba(10,10,10,0.6);border:1px solid var(--line);border-radius:9px;padding:12px 14px;color:var(--off);font-family:'Inter';font-size:14px;outline:none;transition:.2s;resize:vertical;}
.field input:focus,.field select:focus,.field textarea:focus{border-color:var(--gold);}
.field input::placeholder,.field textarea::placeholder{color:#5c5c57;}
.date-pill{background:rgba(201,168,76,0.08);border:1px solid rgba(201,168,76,0.3);border-radius:9px;padding:12px 14px;font-size:14px;color:var(--gold);}
.chips{display:flex;flex-wrap:wrap;gap:8px;}
.chip{background:transparent;border:1px solid var(--line);border-radius:999px;color:var(--grey);font-size:13px;padding:8px 15px;cursor:pointer;transition:.18s;font-family:'Inter';}
.chip:hover{border-color:var(--gold);color:var(--off);}
.chip.on{background:var(--gold);border-color:var(--gold);color:var(--black);font-weight:600;}
.foot{max-width:860px;margin:80px auto 0;padding:30px 22px 40px;border-top:1px solid var(--line);}
.foot-row{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;}
.foot-brand{font-family:'Bebas Neue';font-size:26px;letter-spacing:2px;}
.foot-links{display:flex;gap:20px;}
.foot-links a{color:var(--grey);text-decoration:none;font-size:13px;transition:.2s;}
.foot-links a:hover{color:var(--gold);}
.foot-fine{color:#4c4c48;font-size:11px;letter-spacing:1px;margin:20px 0 0;}
.logout{display:flex;align-items:center;gap:7px;background:transparent;border:1px solid var(--line);color:var(--grey);border-radius:8px;padding:9px 14px;font-size:13px;cursor:pointer;transition:.2s;height:fit-content;}
.logout:hover{border-color:var(--red);color:#ff8a8a;}
.stat-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;}
.stat{background:rgba(232,232,224,0.03);border:1px solid var(--line);border-radius:14px;padding:20px;display:flex;flex-direction:column;gap:6px;}
.stat strong{font-family:'Bebas Neue';font-size:40px;line-height:1;}
.stat span{font-size:11px;letter-spacing:2px;text-transform:uppercase;color:var(--grey);}
.req-list{display:flex;flex-direction:column;gap:14px;margin-top:24px;}
.empty{color:var(--grey);font-size:14px;text-align:center;padding:40px;display:flex;align-items:center;justify-content:center;gap:8px;}
.req{background:rgba(232,232,224,0.03);border:1px solid var(--line);border-radius:14px;padding:20px;transition:.2s;}
.req.accepted{border-color:rgba(201,168,76,0.28);}
.req.declined{opacity:.55;}
.req-top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;}
.req-top h3{margin:0 0 8px;font-size:17px;font-weight:600;}
.req-meta{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin:0;font-size:12px;color:var(--grey);}
.req-meta span{display:flex;align-items:center;gap:5px;}
.tag{background:rgba(201,168,76,0.12);color:var(--gold);padding:3px 10px;border-radius:999px;font-size:11px;}
.status{display:flex;align-items:center;gap:5px;font-size:11px;letter-spacing:1px;text-transform:uppercase;padding:5px 11px;border-radius:999px;white-space:nowrap;}
.status.pending{background:rgba(201,168,76,0.12);color:var(--gold);}
.status.accepted{background:rgba(60,200,120,0.12);color:#5fd99a;}
.status.declined{background:rgba(255,59,59,0.12);color:#ff8a8a;}
.req-msg{color:var(--off);font-size:13px;line-height:1.55;margin:14px 0;opacity:.85;}
.req-foot{display:flex;justify-content:space-between;font-size:12px;color:var(--grey);gap:12px;}
.req-budget{color:var(--gold);font-weight:600;}
.req-actions{display:flex;gap:10px;margin-top:16px;}
.act{display:flex;align-items:center;gap:7px;border:none;border-radius:8px;padding:10px 18px;font-size:13px;font-weight:600;cursor:pointer;transition:.18s;font-family:'Inter';}
.act:disabled{opacity:.6;cursor:default;}
.act.accept{background:var(--gold);color:var(--black);}
.act.accept:hover{filter:brightness(1.08);}
.act.decline{background:transparent;border:1px solid var(--line);color:var(--grey);}
.act.decline:hover{border-color:var(--red);color:#ff8a8a;}
.toast{position:fixed;bottom:26px;left:50%;transform:translateX(-50%);z-index:80;background:var(--gold);color:var(--black);font-weight:600;font-size:13px;padding:13px 22px;border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,0.4);animation:rise .3s ease;max-width:90vw;text-align:center;}
@keyframes rise{from{opacity:0;transform:translate(-50%,12px);}to{opacity:1;transform:translate(-50%,0);}}
.fade{opacity:0;animation:fadeUp .7s ease forwards;}
@keyframes fadeUp{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:translateY(0);}}
.spin{animation:sp 1s linear infinite;}
@keyframes sp{to{transform:rotate(360deg);}}
@media(max-width:560px){.field-row{grid-template-columns:1fr;}.stat-grid{grid-template-columns:1fr;}.svc-grid{grid-template-columns:1fr;}.cred-strip{gap:16px;}.block{padding-left:16px;padding-right:16px;}.cal-wrap{padding:14px;}.cal-head,.cal-grid{gap:6px;}.cal-cell{font-size:13px;}}
`;
