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

// Preset genres for the multi-select. Stored comma-joined in the `genre`
// column, so DJs can pick several and the list stays filterable later.
// (Commas are the separator — keep labels comma-free.)
const GENRES = [
  "Bollywood", "Bolly Tech", "Commercial", "Open Format", "Hip-Hop / R&B", "House", "Tech House",
  "Techno", "Melodic Techno", "Afro House", "Deep House", "Progressive House",
  "Trance", "EDM / Festival", "Punjabi", "Regional", "Disco / Funk", "Amapiano",
  "Drum & Bass", "Reggaeton", "Trap", "Pop",
];

export default function DJCollectivePopup({ autoOpen = true }) {
  const [shown, setShown] = useState(false);     // mounted in DOM
  const [open, setOpen] = useState(false);        // entrance animation
  const [phase, setPhase] = useState("form");     // form | success
  const [data, setData] = useState({ name: "", dj_name: "", genres: [], years: "", instagram: "", phone: "", company: "" });
  const [customGenre, setCustomGenre] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [att, setAtt] = useState(null);            // { total, names } live counter
  const [dup, setDup] = useState(false);           // already-registered (dedup)
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
    if (autoOpen && !seen) {
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
  const toggleGenre = (g) => setData((d) => ({
    ...d, genres: d.genres.includes(g) ? d.genres.filter((x) => x !== g) : [...d.genres, g],
  }));
  const addCustomGenre = () => {
    const g = customGenre.trim().replace(/,/g, "");
    if (!g) return;
    setData((d) => (d.genres.some((x) => x.toLowerCase() === g.toLowerCase()) ? d : { ...d, genres: [...d.genres, g] }));
    setCustomGenre("");
  };

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
    let status = "error";
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/djc_rsvp`, {
        method: "POST",
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          p_name: name, p_phone: phone, p_session: SESSION,
          p_dj_name: data.dj_name.trim() || null,
          p_genre: data.genres.length ? data.genres.join(", ") : null,
          p_years: data.years.trim() || null,
          p_instagram: data.instagram.trim() || null,
        }),
      });
      if (r.ok) { const d = await r.json(); status = (d && d.status) || "error"; }
    } catch {}
    setSubmitting(false);
    if (status === "ok" || status === "duplicate") {
      try { localStorage.setItem(SEEN_KEY, "1"); } catch {}
      setDup(status === "duplicate"); setPhase("success"); fetchAttendees();
    } else setErrors({ form: "Couldn't send that — please try again." });
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
            <p className="djc-date">🗓 Monday, 20 July · 9 PM onwards<br />📍 Watsons, Indiranagar</p>
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
              <label className="djc-field"><span>Years in the scene</span>
                <select value={data.years} onChange={(e) => set("years", e.target.value)}>
                  <option value="">—</option>
                  <option value="Under 2 years">Under 2 years</option>
                  <option value="2-5 years">2-5 years</option>
                  <option value="5-10 years">5-10 years</option>
                  <option value="10-15 years">10-15 years</option>
                  <option value="15+ years">15+ years</option>
                </select></label>
            </div>

            <div className="djc-field djc-genres">
              <span>Genre(s) <em>(pick any that fit)</em></span>
              <div className="djc-chips">
                {GENRES.map((g) => (
                  <button type="button" key={g} className={`djc-chip${data.genres.includes(g) ? " on" : ""}`} aria-pressed={data.genres.includes(g)} onClick={() => toggleGenre(g)}>{g}</button>
                ))}
                {data.genres.filter((g) => !GENRES.includes(g)).map((g) => (
                  <button type="button" key={g} className="djc-chip on" aria-pressed="true" onClick={() => toggleGenre(g)}>{g} ✕</button>
                ))}
              </div>
              <div className="djc-chip-add">
                <input type="text" value={customGenre} placeholder="Other — type &amp; add" onChange={(e) => setCustomGenre(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomGenre(); } }} />
                <button type="button" className="djc-chip-addbtn" onClick={addCustomGenre} disabled={!customGenre.trim()}>Add</button>
              </div>
            </div>

            <label className="djc-field"><span>Instagram</span>
              <input type="text" value={data.instagram} onChange={(e) => set("instagram", e.target.value)} placeholder="@handle" /></label>

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
            <p className="djc-success-line">{dup ? "You're already on the list — see you 20 July." : "You're in for 20 July. See you there."}</p>
            <div className="djc-push">
              <span className="djc-push-head">One thing left — don't skip it</span>
              <span className="djc-push-sub">Reminders, the line-up &amp; any last-minute changes go out <strong>only on the WhatsApp channel</strong>. If you're not on it, you'll miss out.</span>
            </div>
            <a className="djc-wa" href={WA_CHANNEL} target="_blank" rel="noopener noreferrer">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12.004 0C5.374 0 0 5.373 0 12c0 2.139.561 4.14 1.538 5.878L0 24l6.305-1.511A11.95 11.95 0 0 0 12.004 24C18.63 24 24 18.627 24 12c0-6.628-5.371-12-11.996-12z"/></svg>
              Join the WhatsApp channel
            </a>
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
.djc-intro{font-family:'Lora',serif;font-style:italic;font-size:.95rem;line-height:1.55;color:rgba(224,220,207,.78);text-align:center;margin:0 0 .2rem;}
.djc-date{font-family:'Inter',sans-serif;font-size:.8rem;font-weight:600;letter-spacing:.02em;color:#C9A84C;text-align:center;margin:0 0 .4rem;line-height:1.5;}
.djc-date-sub{font-weight:400;color:rgba(224,220,207,.5);}
.djc-field{display:flex;flex-direction:column;gap:.3rem;font-size:.64rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:rgba(224,220,207,.5);}
.djc-field em{text-transform:none;letter-spacing:0;font-style:italic;font-weight:400;color:rgba(224,220,207,.38);}
.djc-field input,.djc-field select{background:#0e0e0e;border:1px solid #262626;color:#E0DCCF;padding:.7rem .8rem;font-size:.92rem;font-family:'Inter',sans-serif;border-radius:4px;text-transform:none;letter-spacing:normal;font-weight:400;transition:border-color .2s;}
.djc-field input:focus,.djc-field select:focus{outline:none;border-color:#C9A84C;}
.djc-field input::placeholder{color:rgba(224,220,207,.26);}
.djc-row{display:flex;gap:.7rem;}
.djc-row .djc-field{flex:1;min-width:0;}
.djc-genres>span{margin-bottom:.1rem;}
.djc-chips{display:flex;flex-wrap:wrap;gap:.4rem;}
.djc-chip{background:#0e0e0e;border:1px solid #2a2a2a;color:rgba(224,220,207,.8);font-family:'Inter',sans-serif;font-size:.78rem;font-weight:500;letter-spacing:normal;text-transform:none;padding:.42rem .7rem;border-radius:999px;cursor:pointer;transition:border-color .15s,background .15s,color .15s;}
.djc-chip:hover{border-color:#C9A84C;color:#E0DCCF;}
.djc-chip.on{background:#C9A84C;border-color:#C9A84C;color:#080808;font-weight:600;}
.djc-chip-add{display:flex;gap:.4rem;margin-top:.5rem;}
.djc-chip-add input{flex:1;min-width:0;background:#0e0e0e;border:1px solid #262626;color:#E0DCCF;padding:.55rem .7rem;font-size:.85rem;font-family:'Inter',sans-serif;border-radius:4px;text-transform:none;letter-spacing:normal;font-weight:400;}
.djc-chip-add input:focus{outline:none;border-color:#C9A84C;}
.djc-chip-add input::placeholder{color:rgba(224,220,207,.26);}
.djc-chip-addbtn{flex:0 0 auto;background:transparent;border:1px solid #C9A84C;color:#C9A84C;font-family:'Inter',sans-serif;font-size:.8rem;font-weight:600;letter-spacing:normal;text-transform:none;padding:.55rem .9rem;border-radius:4px;cursor:pointer;transition:background .15s,color .15s;}
.djc-chip-addbtn:hover:not(:disabled){background:#C9A84C;color:#080808;}
.djc-chip-addbtn:disabled{opacity:.4;cursor:default;}
.djc-hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;}
.djc-err{font-style:normal;font-size:.72rem;font-weight:400;letter-spacing:0;text-transform:none;color:#e89090;margin-top:.1rem;}
.djc-err--form{text-align:center;}
.djc-submit{margin-top:.5rem;background:#C9A84C;color:#080808;border:none;padding:.85rem 1rem;font-family:'Oswald',sans-serif;font-weight:700;font-size:1.05rem;letter-spacing:.08em;text-transform:uppercase;border-radius:4px;cursor:pointer;text-shadow:none;transition:filter .2s;}
.djc-submit:hover{filter:brightness(1.08);}
.djc-submit:disabled{opacity:.55;cursor:default;}
.djc-success{padding:2rem 1.6rem 1.9rem;text-align:center;display:flex;flex-direction:column;align-items:center;gap:1.1rem;}
.djc-success-line{font-family:'Lora',serif;font-style:italic;font-size:1.5rem;line-height:1.3;color:#C9A84C;margin:0;}
.djc-push{width:100%;background:rgba(37,211,102,.08);border:1px solid rgba(37,211,102,.32);border-radius:9px;padding:13px 15px;display:flex;flex-direction:column;gap:6px;text-align:left;}
.djc-push-head{font-family:'Oswald',sans-serif;font-weight:700;font-size:.95rem;letter-spacing:.03em;text-transform:uppercase;color:#E0DCCF;}
.djc-push-sub{font-family:'Inter',sans-serif;font-size:.82rem;line-height:1.5;color:rgba(224,220,207,.75);}
.djc-push-sub strong{color:#3ddc84;font-weight:600;}
.djc-wa{display:inline-flex;align-items:center;justify-content:center;gap:.55rem;width:100%;box-sizing:border-box;background:#25D366;color:#06280f;font-family:'Oswald',sans-serif;font-weight:700;font-size:1rem;letter-spacing:.04em;text-transform:uppercase;text-decoration:none;padding:1rem 1.3rem;border-radius:7px;line-height:1.2;text-shadow:none;transition:filter .2s,transform .15s;animation:djc-pulse 2.2s ease-in-out infinite;}
.djc-wa:hover{filter:brightness(1.06);transform:translateY(-1px);}
.djc-wa svg{width:21px;height:21px;flex-shrink:0;}
@keyframes djc-pulse{0%,100%{box-shadow:0 0 0 0 rgba(37,211,102,0);}50%{box-shadow:0 0 0 7px rgba(37,211,102,.15);}}
@media (prefers-reduced-motion: reduce){ .djc-wa{animation:none;} }
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
