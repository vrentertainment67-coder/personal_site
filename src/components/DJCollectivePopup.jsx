import React, { useState, useEffect, useRef } from "react";

// ============================================================
// THE DJ COLLECTIVE, Bengaluru — recurring meetup RSVP popup
// Lives on /thevicfix. Opens via any [data-djc-open] button AND auto-opens
// once per visitor (localStorage "djc_rsvp_seen"). Anonymous INSERT into
// Supabase `dj_collective_rsvps` using the public anon key — same pattern as
// EventPopup.jsx. Self-contained styles (Astro scopes page CSS away from
// islands). Branded as The DJ Collective, NOT DJ Vic.
//
// SESSION: change this string for each future edition. Nothing else to touch.
// ============================================================

const SUPABASE_URL =
  import.meta.env?.PUBLIC_SUPABASE_URL || "https://jftnhuutttmccmqnnybf.supabase.co";
const SUPABASE_KEY =
  import.meta.env?.PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_ysWygc3QGKbfsUd0f7Evzw__98TEoo9";

const SESSION = "2026-07-launch";
const WA_CHANNEL = "https://whatsapp.com/channel/0029Vb8ZoHlATRSqaILd683A";
const SEEN_KEY = "djc_rsvp_seen";

// "Martin, Vicky, Shine and Jasmeet + 20 are going" from { total, names }.
function attLine(att) {
  if (!att || !att.total) return null;
  const names = (att.names || []).filter(Boolean);
  const shown = names.slice(0, 4);
  let s = shown.length <= 1 ? (shown[0] || "") : shown.slice(0, -1).join(", ") + " and " + shown[shown.length - 1];
  const extra = att.total - shown.length;
  if (extra > 0) s += ` + ${extra}`;
  return s ? `${s} ${att.total === 1 ? "is" : "are"} going` : `${att.total} going`;
}

export default function DJCollectivePopup() {
  const [shown, setShown] = useState(false);     // mounted in DOM
  const [open, setOpen] = useState(false);        // entrance animation
  const [phase, setPhase] = useState("form");     // form | success
  const [data, setData] = useState({ name: "", dj_name: "", genre: "", years: "", instagram: "", phone: "", company: "" });
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [att, setAtt] = useState(null);            // { total, names } live counter
  const cardRef = useRef(null);

  const show = () => { setShown(true); requestAnimationFrame(() => setOpen(true)); };
  const hide = () => { setOpen(false); setTimeout(() => setShown(false), 280); };

  async function fetchAttendees() {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/dj_collective_attendees`, {
        method: "POST",
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ p_session: SESSION }),
      });
      if (r.ok) setAtt(await r.json());
    } catch {}
  }

  // ── Triggers: [data-djc-open] buttons + auto-open once per visitor ──
  useEffect(() => {
    const openers = Array.from(document.querySelectorAll("[data-djc-open]"));
    const onClick = (e) => { e.preventDefault(); setErrors({}); setPhase("form"); show(); };
    openers.forEach((b) => b.addEventListener("click", onClick));

    let timer = null, seen = null;
    try { seen = localStorage.getItem(SEEN_KEY); } catch {}
    if (!seen) {
      timer = setTimeout(() => {
        try { localStorage.setItem(SEEN_KEY, "1"); } catch {}
        setPhase("form"); show();
      }, 1600);
    }
    return () => { openers.forEach((b) => b.removeEventListener("click", onClick)); if (timer) clearTimeout(timer); };
  }, []);

  // ── Scroll lock + ESC + focus + live count while open ──
  useEffect(() => {
    if (!shown) return;
    fetchAttendees();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => { if (e.key === "Escape") hide(); };
    document.addEventListener("keydown", onKey);
    const f = cardRef.current && cardRef.current.querySelector(".djc-field input");
    if (f) setTimeout(() => f.focus(), 80);
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", onKey); };
  }, [shown]);

  const set = (k, v) => setData((d) => ({ ...d, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    if (submitting) return;
    if (data.company) { hide(); return; }            // honeypot tripped
    const name = data.name.trim();
    const phone = data.phone.trim();
    const errs = {};
    if (name.length < 2) errs.name = "Let us know what you go by.";
    if (phone.replace(/\D/g, "").length < 8) errs.phone = "Add a valid WhatsApp number.";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSubmitting(true);
    const row = {
      name, phone,
      dj_name: data.dj_name.trim() || null,
      genre: data.genre.trim() || null,
      years: data.years.trim() || null,
      instagram: data.instagram.trim() || null,
      session: SESSION,
    };
    let ok = false;
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/dj_collective_rsvps`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify(row),
      });
      ok = r.ok;
    } catch {}
    setSubmitting(false);
    if (ok) { try { localStorage.setItem(SEEN_KEY, "1"); } catch {} setPhase("success"); fetchAttendees(); }
    else setErrors({ form: "Couldn't send that — please try again." });
  }

  if (!shown) return null;

  return (
    <div className={`djc-overlay${open ? " is-open" : ""}`} role="dialog" aria-modal="true" aria-label="The DJ Collective — RSVP">
      <style>{styles}</style>
      <div className="djc-backdrop" onClick={hide} />
      <div className="djc-panel" ref={cardRef}>
        <button className="djc-x" onClick={hide} aria-label="Close">&times;</button>

        <div className="djc-head">
          <span className="djc-brand">The DJ Collective</span>
          <span className="djc-city">Bengaluru</span>
          {attLine(att) && <span className="djc-count">{attLine(att)}</span>}
        </div>

        {phase === "form" ? (
          <form className="djc-body" onSubmit={submit} noValidate>
            <p className="djc-intro">No agenda. Just Bengaluru's DJs catching up.<br />Let us know you're coming.</p>
            <input type="text" name="company" className="djc-hp" tabIndex={-1} autoComplete="off" aria-hidden="true"
              value={data.company} onChange={(e) => set("company", e.target.value)} />

            <label className="djc-field">
              <span>Name <em>(what you go by)</em> *</span>
              <input type="text" value={data.name} autoComplete="name" onChange={(e) => set("name", e.target.value)} placeholder="Your name" />
              {errors.name && <i className="djc-err">{errors.name}</i>}
            </label>

            <div className="djc-row">
              <label className="djc-field"><span>DJ / artist name</span>
                <input type="text" value={data.dj_name} onChange={(e) => set("dj_name", e.target.value)} placeholder="optional" /></label>
              <label className="djc-field"><span>Genre</span>
                <input type="text" value={data.genre} onChange={(e) => set("genre", e.target.value)} placeholder="optional" /></label>
            </div>

            <div className="djc-row">
              <label className="djc-field"><span>Years in the scene</span>
                <select value={data.years} onChange={(e) => set("years", e.target.value)}>
                  <option value="">—</option>
                  <option value="Under 2 years">Under 2 years</option>
                  <option value="2-5 years">2-5 years</option>
                  <option value="5-10 years">5-10 years</option>
                  <option value="10-15 years">10-15 years</option>
                  <option value="15+ years">15+ years</option>
                </select></label>
              <label className="djc-field"><span>Instagram</span>
                <input type="text" value={data.instagram} onChange={(e) => set("instagram", e.target.value)} placeholder="@handle" /></label>
            </div>

            <label className="djc-field">
              <span>Phone <em>(WhatsApp)</em> *</span>
              <input type="tel" inputMode="tel" value={data.phone} autoComplete="tel" onChange={(e) => set("phone", e.target.value.replace(/[^\d+\s()-]/g, ""))} placeholder="+91 ..." />
              {errors.phone && <i className="djc-err">{errors.phone}</i>}
            </label>

            {errors.form && <i className="djc-err djc-err--form">{errors.form}</i>}
            <button type="submit" className="djc-submit" disabled={submitting}>{submitting ? "Sending…" : "Count me in"}</button>
          </form>
        ) : (
          <div className="djc-success">
            <p className="djc-success-line">You're in. See you there.</p>
            <a className="djc-wa" href={WA_CHANNEL} target="_blank" rel="noopener noreferrer">Join the channel for date, venue &amp; updates</a>
            <p className="djc-foot">No agenda. No headliner.</p>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = `
@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&family=Lora:ital@1&family=Inter:wght@400;500;600&display=swap');
.djc-overlay{position:fixed;inset:0;z-index:10060;display:flex;align-items:center;justify-content:center;padding:1rem;font-family:'Inter',sans-serif;}
.djc-backdrop{position:absolute;inset:0;background:rgba(3,3,3,0.86);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);opacity:0;transition:opacity .28s ease;}
.djc-overlay.is-open .djc-backdrop{opacity:1;}
.djc-panel{position:relative;z-index:1;width:min(440px,100%);max-height:92vh;overflow-y:auto;background:#080808;color:#E0DCCF;border:1px solid rgba(201,168,76,0.35);border-radius:10px;box-shadow:0 30px 90px rgba(0,0,0,0.7);transform:translateY(18px) scale(.98);opacity:0;transition:transform .32s cubic-bezier(.22,1,.36,1),opacity .28s ease;}
.djc-overlay.is-open .djc-panel{transform:none;opacity:1;}
.djc-x{position:absolute;top:.55rem;right:.6rem;width:32px;height:32px;display:flex;align-items:center;justify-content:center;background:none;border:none;color:rgba(224,220,207,.55);font-size:1.6rem;line-height:1;cursor:pointer;z-index:3;transition:color .2s;}
.djc-x:hover{color:#E0DCCF;}
.djc-head{padding:2rem 1.6rem 1.05rem;text-align:center;background:radial-gradient(ellipse 90% 80% at 50% 0%,rgba(201,168,76,0.14),transparent 70%);}
.djc-brand{display:block;font-family:'Oswald',sans-serif;font-weight:700;font-size:2rem;line-height:1;letter-spacing:.05em;text-transform:uppercase;color:#E0DCCF;}
.djc-city{display:block;font-family:'Oswald',sans-serif;font-weight:500;font-size:.82rem;letter-spacing:.42em;text-transform:uppercase;color:#C9A84C;margin-top:.5rem;}
.djc-count{display:block;font-family:'Lora',serif;font-style:italic;font-size:.82rem;line-height:1.4;color:rgba(201,168,76,.92);margin-top:.85rem;padding-top:.7rem;border-top:1px solid rgba(201,168,76,.18);}
.djc-body{padding:1.05rem 1.6rem 1.7rem;display:flex;flex-direction:column;gap:.7rem;}
.djc-intro{font-family:'Lora',serif;font-style:italic;font-size:.95rem;line-height:1.55;color:rgba(224,220,207,.78);text-align:center;margin:0 0 .4rem;}
.djc-field{display:flex;flex-direction:column;gap:.3rem;font-size:.64rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:rgba(224,220,207,.5);}
.djc-field em{text-transform:none;letter-spacing:0;font-style:italic;font-weight:400;color:rgba(224,220,207,.38);}
.djc-field input,.djc-field select{background:#0e0e0e;border:1px solid #262626;color:#E0DCCF;padding:.7rem .8rem;font-size:.92rem;font-family:'Inter',sans-serif;border-radius:4px;text-transform:none;letter-spacing:normal;font-weight:400;transition:border-color .2s;}
.djc-field input:focus,.djc-field select:focus{outline:none;border-color:#C9A84C;}
.djc-field input::placeholder{color:rgba(224,220,207,.26);}
.djc-row{display:flex;gap:.7rem;}
.djc-row .djc-field{flex:1;min-width:0;}
.djc-hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;}
.djc-err{font-style:normal;font-size:.72rem;font-weight:400;letter-spacing:0;text-transform:none;color:#e89090;margin-top:.1rem;}
.djc-err--form{text-align:center;}
.djc-submit{margin-top:.5rem;background:#C9A84C;color:#080808;border:none;padding:.85rem 1rem;font-family:'Oswald',sans-serif;font-weight:700;font-size:1.05rem;letter-spacing:.08em;text-transform:uppercase;border-radius:4px;cursor:pointer;text-shadow:none;transition:filter .2s;}
.djc-submit:hover{filter:brightness(1.08);}
.djc-submit:disabled{opacity:.55;cursor:default;}
.djc-success{padding:2.4rem 1.6rem 2.1rem;text-align:center;display:flex;flex-direction:column;align-items:center;gap:1.2rem;}
.djc-success-line{font-family:'Lora',serif;font-style:italic;font-size:1.5rem;line-height:1.3;color:#C9A84C;margin:0;}
.djc-wa{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;background:#C9A84C;color:#080808;font-family:'Oswald',sans-serif;font-weight:700;font-size:.8rem;letter-spacing:.05em;text-transform:uppercase;text-decoration:none;padding:.85rem 1.3rem;border-radius:5px;line-height:1.3;text-shadow:none;transition:filter .2s,transform .15s;}
.djc-wa:hover{filter:brightness(1.08);transform:translateY(-1px);}
.djc-foot{font-family:'Lora',serif;font-style:italic;font-size:.82rem;color:rgba(224,220,207,.45);margin:0;}
@media (max-width:480px){
  .djc-overlay{align-items:flex-end;padding:0;}
  .djc-panel{width:100%;max-height:94vh;border-radius:14px 14px 0 0;border-bottom:none;}
  .djc-head{padding:1.6rem 1.3rem .85rem;}
  .djc-brand{font-size:1.7rem;}
  .djc-body{padding:.9rem 1.3rem 1.3rem;}
  .djc-row{flex-direction:column;gap:.7rem;}
}
@media (prefers-reduced-motion: reduce){ .djc-backdrop,.djc-panel{transition:none;} .djc-panel{transform:none;} }
`;
