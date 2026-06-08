import React, { useState, useEffect, useRef } from "react";

// ============================================================
// DJ VIC — event guest-list popup (homepage)
// Appears 2s after landing, once per visitor (localStorage).
// RSVP form until the cut-off, then a "doors open" message,
// then nothing once the event night is over.
//
// Saves to Supabase `event_rsvps` (anon insert) and pings VIC's
// phone via the same ntfy topic the booking form uses.
// Self-contained styles — Astro scopes page CSS away from islands.
// ============================================================

// ── Event config — change here if details move ──────────────
const EVENT = {
  id: "chamatkar-2026-06-13",
  title: "Chamatkar",
  venue: "Happy Brew",
  area: "Koramangala, Bangalore",
  dateLabel: "Saturday, 13 June",
  timeLabel: "9:00 PM onwards",
  lineup: "DJ VIC  ·  Shaad",
  genre: "Bollywood / Commercial — Audio-Visual Set",
  // Fixed instants in IST (+05:30) so timing is correct regardless of visitor TZ
  rsvpCutoff: Date.parse("2026-06-13T18:00:00+05:30"),
  expiry:     Date.parse("2026-06-14T01:00:00+05:30"),
  whatsapp:   "919611711677",
};

const SUPABASE_URL =
  import.meta.env?.PUBLIC_SUPABASE_URL || "https://jftnhuutttmccmqnnybf.supabase.co";
const SUPABASE_KEY =
  import.meta.env?.PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_ysWygc3QGKbfsUd0f7Evzw__98TEoo9";
const NTFY_TOPIC = "djvic-bookings-7k9f3hQ2pX8mN5vR";
const LS_KEY = "chamatkar_rsvp_v1"; // 'done' | 'dismissed'

export default function EventPopup() {
  const [phase, setPhase] = useState("hidden"); // hidden | form | closed | thanks
  const [open, setOpen] = useState(false);       // controls entrance animation
  const [data, setData] = useState({ name: "", phone: "", guests: "2", entry: "", instagram: "", company: "" });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");
  const cardRef = useRef(null);

  // ── Decide whether/what to show ───────────────────────────
  useEffect(() => {
    const now = Date.now();
    if (now >= EVENT.expiry) return;                 // event night over → never
    let seen = null;
    try { seen = localStorage.getItem(LS_KEY); } catch {}
    if (seen) return;                                // already acted → don't nag

    const startPhase = now < EVENT.rsvpCutoff ? "form" : "closed";
    const t = setTimeout(() => {
      setPhase(startPhase);
      requestAnimationFrame(() => setOpen(true));
    }, 2000);
    return () => clearTimeout(t);
  }, []);

  // ── Body scroll lock + ESC + focus while open ─────────────
  useEffect(() => {
    if (phase === "hidden") return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => { if (e.key === "Escape") dismiss(); };
    document.addEventListener("keydown", onKey);
    const f = cardRef.current && cardRef.current.querySelector("input, button");
    if (f) setTimeout(() => f.focus(), 60);
    return () => { document.body.style.overflow = prevOverflow; document.removeEventListener("keydown", onKey); };
  }, [phase]);

  function remember(v) { try { localStorage.setItem(LS_KEY, v); } catch {} }

  function close(rememberAs) {
    setOpen(false);
    if (rememberAs) remember(rememberAs);
    setTimeout(() => setPhase("hidden"), 280);
  }
  function dismiss() { close("dismissed"); }

  async function submit(e) {
    e.preventDefault();
    if (submitting) return;
    if (data.company) { close("done"); return; } // honeypot tripped
    const name = data.name.trim();
    const phone = data.phone.trim();
    if (name.length < 2) { setErr("Please enter your name."); return; }
    if (phone.replace(/\D/g, "").length < 8) { setErr("Please enter a valid phone number."); return; }
    setErr("");
    setSubmitting(true);

    const row = {
      event: EVENT.id,
      name,
      phone,
      guests: parseInt(data.guests, 10) || 1,
      entry_type: data.entry || null,
      instagram: data.instagram.trim() || null,
      source: "homepage-popup",
      user_agent: navigator.userAgent.slice(0, 300),
    };

    // 1) Save to Supabase
    let ok = false;
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/event_rsvps`, {
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

    if (ok) {
      // 2) Only ping VIC's phone once the RSVP is actually saved (non-blocking)
      try {
        const body =
          `Name: ${name}\nPhone: ${phone}\nGuests: ${row.guests}` +
          (row.entry_type ? `\nEntry: ${row.entry_type}` : "") +
          (row.instagram ? `\nInstagram: ${row.instagram}` : "") +
          `\n\nChamatkar @ Happy Brew · Sat 13 Jun`;
        const url =
          `https://ntfy.sh/${NTFY_TOPIC}?title=${encodeURIComponent("🎉 Chamatkar RSVP — " + name)}&priority=4&tags=tada,studio_microphone`;
        navigator.sendBeacon(url, new Blob([body], { type: "text/plain" }));
      } catch {}
      remember("done");
      setPhase("thanks");
    } else {
      setErr("Couldn't submit — please try again, or WhatsApp us below.");
    }
  }

  if (phase === "hidden") return null;

  const waHref =
    `https://wa.me/${EVENT.whatsapp}?text=` +
    encodeURIComponent(
      `Hi VIC! I'd like to be on the guest list for ${EVENT.title} @ ${EVENT.venue} (Sat 13 June).` +
      (data.name ? ` Name: ${data.name.trim()}.` : "") +
      (data.guests ? ` Guests: ${data.guests}.` : "")
    );

  return (
    <div className={`ep-overlay${open ? " is-open" : ""}`} role="dialog" aria-modal="true" aria-labelledby="ep-title">
      <style>{styles}</style>
      <div className="ep-backdrop" onClick={dismiss} />
      <div className="ep-card" ref={cardRef}>
        <button className="ep-x" onClick={dismiss} aria-label="Close">&times;</button>

        <div className="ep-head">
          <span className="ep-eyebrow">Guest List · This Saturday</span>
          <h2 id="ep-title" className="ep-title">{EVENT.title}</h2>
          <p className="ep-venue">@ {EVENT.venue} · {EVENT.area}</p>
          <div className="ep-meta">
            <span>🗓 {EVENT.dateLabel}</span>
            <span>🕘 {EVENT.timeLabel}</span>
          </div>
          <p className="ep-lineup">{EVENT.lineup}</p>
          <p className="ep-genre">{EVENT.genre}</p>
        </div>

        {phase === "form" && (
          <form className="ep-form" onSubmit={submit} noValidate>
            <input
              type="text" name="company" className="ep-hp" tabIndex={-1} autoComplete="off"
              value={data.company} onChange={(e) => setData({ ...data, company: e.target.value })} aria-hidden="true"
            />
            <label className="ep-field">
              <span>Name *</span>
              <input type="text" value={data.name} required autoComplete="name"
                onChange={(e) => setData({ ...data, name: e.target.value })} placeholder="Your name" />
            </label>
            <label className="ep-field">
              <span>Phone / WhatsApp *</span>
              <input type="tel" inputMode="tel" value={data.phone} required autoComplete="tel"
                onChange={(e) => setData({ ...data, phone: e.target.value })} placeholder="+91 ..." />
            </label>
            <div className="ep-row">
              <label className="ep-field ep-field--sm">
                <span>Guests</span>
                <select value={data.guests} onChange={(e) => setData({ ...data, guests: e.target.value })}>
                  {["1","2","3","4","5","6","7","8+"].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <label className="ep-field ep-field--sm">
                <span>Entry</span>
                <select value={data.entry} onChange={(e) => setData({ ...data, entry: e.target.value })}>
                  <option value="">—</option>
                  <option value="couple">Couple</option>
                  <option value="stag">Stag</option>
                  <option value="mixed">Mixed group</option>
                </select>
              </label>
            </div>
            <label className="ep-field">
              <span>Instagram <em>(optional)</em></span>
              <input type="text" value={data.instagram} autoComplete="off"
                onChange={(e) => setData({ ...data, instagram: e.target.value })} placeholder="@handle" />
            </label>
            {err && <p className="ep-err" role="alert">{err}</p>}
            <button type="submit" className="ep-submit" disabled={submitting}>
              {submitting ? "Adding you…" : "Get on the Guest List →"}
            </button>
            <p className="ep-fine">RSVPs close Saturday 6 PM. We'll WhatsApp you the details.</p>
          </form>
        )}

        {phase === "closed" && (
          <div className="ep-closed">
            <p className="ep-closed-lead">Guest-list RSVPs are closed — but the night's on.</p>
            <p className="ep-closed-sub">Doors open 9 PM at {EVENT.venue}, {EVENT.area}. Walk in, or message us to sort entry.</p>
            <a className="ep-wa" href={waHref} target="_blank" rel="noopener noreferrer">Message on WhatsApp</a>
          </div>
        )}

        {phase === "thanks" && (
          <div className="ep-thanks">
            <div className="ep-tick">✓</div>
            <p className="ep-thanks-lead">You're on the list!</p>
            <p className="ep-thanks-sub">See you Saturday at {EVENT.venue}. Tap below to confirm on WhatsApp so we have you saved.</p>
            <a className="ep-wa" href={waHref} target="_blank" rel="noopener noreferrer">Confirm on WhatsApp</a>
            <button className="ep-dismiss-link" onClick={() => close("done")}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = `
.ep-overlay{position:fixed;inset:0;z-index:10050;display:flex;align-items:center;justify-content:center;padding:1rem;font-family:'Space Grotesk',sans-serif;}
.ep-backdrop{position:absolute;inset:0;background:rgba(4,7,6,0.82);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);opacity:0;transition:opacity .28s ease;}
.ep-overlay.is-open .ep-backdrop{opacity:1;}
.ep-card{position:relative;z-index:1;width:min(440px,100%);max-height:92vh;overflow-y:auto;background:#0c0c0c;border:1px solid rgba(201,168,76,0.35);border-radius:10px;box-shadow:0 30px 90px rgba(0,0,0,0.65);transform:translateY(18px) scale(.98);opacity:0;transition:transform .32s cubic-bezier(.22,1,.36,1),opacity .28s ease;}
.ep-overlay.is-open .ep-card{transform:none;opacity:1;}
.ep-x{position:absolute;top:.5rem;right:.7rem;background:transparent;border:none;color:rgba(255,255,255,.55);font-size:1.8rem;line-height:1;cursor:pointer;z-index:2;transition:color .2s;}
.ep-x:hover{color:#fff;}
.ep-head{padding:1.9rem 1.6rem 1.2rem;text-align:center;background:radial-gradient(ellipse 90% 70% at 50% 0%,rgba(201,168,76,0.16),transparent 70%);border-bottom:1px solid #1c1c1c;}
.ep-eyebrow{display:inline-block;font-size:.6rem;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:#c9a84c;margin-bottom:.6rem;}
.ep-title{font-family:'Bebas Neue',sans-serif;font-size:3rem;line-height:.95;letter-spacing:.04em;color:#fff;margin:0;}
.ep-venue{font-size:.85rem;color:rgba(255,255,255,.7);margin:.35rem 0 .8rem;}
.ep-meta{display:flex;gap:1.1rem;justify-content:center;flex-wrap:wrap;font-size:.78rem;color:rgba(255,255,255,.78);}
.ep-lineup{font-family:'Bebas Neue',sans-serif;font-size:1.15rem;letter-spacing:.06em;color:#e2c475;margin:.9rem 0 .15rem;}
.ep-genre{font-size:.72rem;letter-spacing:.04em;color:rgba(255,255,255,.5);margin:0;}
.ep-form{padding:1.2rem 1.6rem 1.6rem;display:flex;flex-direction:column;gap:.7rem;}
.ep-field{display:flex;flex-direction:column;gap:.3rem;font-size:.72rem;letter-spacing:.04em;text-transform:uppercase;color:rgba(255,255,255,.55);}
.ep-field em{text-transform:none;letter-spacing:0;color:rgba(255,255,255,.35);font-style:italic;}
.ep-field input,.ep-field select{background:#080808;border:1px solid #2a2a2a;color:#fff;padding:.7rem .8rem;font-size:.92rem;font-family:inherit;border-radius:4px;text-transform:none;letter-spacing:normal;transition:border-color .2s;}
.ep-field input:focus,.ep-field select:focus{outline:none;border-color:#c9a84c;}
.ep-field input::placeholder{color:rgba(255,255,255,.3);}
.ep-row{display:flex;gap:.7rem;}
.ep-field--sm{flex:1;}
.ep-hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;}
.ep-err{font-size:.78rem;color:#ff8a8a;margin:.1rem 0 0;}
.ep-submit{margin-top:.4rem;background:#c9a84c;color:#000;border:none;padding:.85rem 1rem;font-family:'Bebas Neue',sans-serif;font-size:1.15rem;letter-spacing:.08em;text-transform:uppercase;border-radius:4px;cursor:pointer;transition:background .2s;}
.ep-submit:hover{background:#e2c475;}
.ep-submit:disabled{opacity:.6;cursor:default;}
.ep-fine{font-size:.68rem;color:rgba(255,255,255,.4);text-align:center;margin:.5rem 0 0;}
.ep-closed,.ep-thanks{padding:1.4rem 1.6rem 1.8rem;text-align:center;display:flex;flex-direction:column;align-items:center;gap:.6rem;}
.ep-closed-lead,.ep-thanks-lead{font-family:'Bebas Neue',sans-serif;font-size:1.5rem;letter-spacing:.03em;color:#fff;margin:0;}
.ep-closed-sub,.ep-thanks-sub{font-size:.85rem;color:rgba(255,255,255,.6);line-height:1.6;margin:0;max-width:34ch;}
.ep-tick{width:54px;height:54px;border-radius:50%;background:rgba(201,168,76,.15);border:1px solid rgba(201,168,76,.5);color:#c9a84c;display:flex;align-items:center;justify-content:center;font-size:1.6rem;}
.ep-wa{display:inline-block;margin-top:.5rem;background:#25D366;color:#000;font-weight:700;font-size:.8rem;letter-spacing:.06em;text-transform:uppercase;text-decoration:none;padding:.75rem 1.4rem;border-radius:4px;transition:background .2s;}
.ep-wa:hover{background:#20bd5a;color:#000;}
.ep-dismiss-link{background:none;border:none;color:rgba(255,255,255,.4);font-size:.75rem;text-decoration:underline;cursor:pointer;margin-top:.2rem;}
@media (max-width:480px){
  .ep-overlay{align-items:flex-end;padding:0;}
  .ep-card{width:100%;max-height:94vh;border-radius:14px 14px 0 0;border-bottom:none;}
  .ep-title{font-size:2.6rem;}
}
@media (prefers-reduced-motion: reduce){
  .ep-backdrop,.ep-card{transition:none;}
  .ep-card{transform:none;}
}
`;
