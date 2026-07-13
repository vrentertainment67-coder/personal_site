import React, { useState, useEffect, useRef } from "react";

// ============================================================
// DJ VIC — event guest-list popup (homepage)
// Loads the live event at runtime from the `events` table (the row
// where active = true AND guestlist_enabled = true). No live event
// → nothing renders. Appears 2s after landing, once per visitor
// per event (localStorage keyed by slug). RSVP form until the
// cut-off, then a "doors open" message, then nothing once expired.
//
// Saves to Supabase `event_rsvps` (anon insert) and pings VIC's
// phone via the same ntfy topic the booking form uses.
// Self-contained styles — Astro scopes page CSS away from islands.
// ============================================================

const SUPABASE_URL =
  import.meta.env?.PUBLIC_SUPABASE_URL || "https://jftnhuutttmccmqnnybf.supabase.co";
const SUPABASE_KEY =
  import.meta.env?.PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_ysWygc3QGKbfsUd0f7Evzw__98TEoo9";
const NTFY_TOPIC = "djvic-bookings-7k9f3hQ2pX8mN5vR";
const WHATSAPP = "919611711677";

export default function EventPopup() {
  const [event, setEvent] = useState(null);       // the live event row
  const [phase, setPhase] = useState("hidden");   // hidden | form | closed | thanks
  const [open, setOpen] = useState(false);        // controls entrance animation
  const [data, setData] = useState({ name: "", phone: "", guests: "2", entry: "", instagram: "", company: "", consent: true });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");
  const [bannerOk, setBannerOk] = useState(true);
  const cardRef = useRef(null);
  const timerRef = useRef(null);

  // ── Load the live event, then decide whether/what to show ──
  useEffect(() => {
    let cancelled = false;
    fetch(`${SUPABASE_URL}/rest/v1/events?active=eq.true&guestlist_enabled=eq.true&select=*&limit=1`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    })
      .then((r) => r.json())
      .then((rows) => {
        if (cancelled) return;
        const ev = Array.isArray(rows) ? rows[0] : null;
        if (!ev) return;
        const expiry = Date.parse(ev.expiry);
        if (expiry && Date.now() >= expiry) return;          // event window over
        let seen = null;
        try { seen = localStorage.getItem(`vic_rsvp_${ev.slug}`); } catch {}
        if (seen) return;                                    // already acted → don't nag
        setEvent(ev);
        const cutoff = Date.parse(ev.rsvp_cutoff);
        const startPhase = cutoff && Date.now() >= cutoff ? "closed" : "form";
        timerRef.current = setTimeout(() => {
          setPhase(startPhase);
          requestAnimationFrame(() => setOpen(true));
        }, 2000);
      })
      .catch(() => {});
    return () => { cancelled = true; if (timerRef.current) clearTimeout(timerRef.current); };
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

  function remember(v) { try { if (event) localStorage.setItem(`vic_rsvp_${event.slug}`, v); } catch {} }

  function close(rememberAs) {
    setOpen(false);
    if (rememberAs) remember(rememberAs);
    setTimeout(() => setPhase("hidden"), 280);
  }
  function dismiss() { close("dismissed"); }

  async function submit(e) {
    e.preventDefault();
    if (submitting || !event) return;
    if (data.company) { close("done"); return; } // honeypot tripped
    const name = data.name.trim();
    const phone = data.phone.trim();
    if (name.length < 2) { setErr("Please enter your name."); return; }
    if (phone.replace(/\D/g, "").length < 8) { setErr("Please enter a valid phone number."); return; }
    setErr("");
    setSubmitting(true);

    const row = {
      event: event.slug,
      name,
      phone,
      guests: parseInt(data.guests, 10) || 1,
      entry_type: data.entry || null,
      instagram: data.instagram.trim() || null,
      consent_followup: !!data.consent,
      wa_opt_in_at: data.consent ? new Date().toISOString() : null,
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
          `\n\n${event.title} @ ${event.venue || ""}`;
        const url =
          `https://ntfy.sh/${NTFY_TOPIC}?title=${encodeURIComponent("🎉 " + event.title + " RSVP — " + name)}&priority=4&tags=tada,studio_microphone`;
        navigator.sendBeacon(url, new Blob([body], { type: "text/plain" }));
      } catch {}
      remember("done");
      setPhase("thanks");
    } else {
      setErr("Couldn't submit — please try again, or WhatsApp us below.");
    }
  }

  if (phase === "hidden" || !event) return null;

  const showBanner = bannerOk && !!event.banner_url;
  const waHref =
    `https://wa.me/${WHATSAPP}?text=` +
    encodeURIComponent(
      `Hi VIC! I'd like to be on the guest list for ${event.title}${event.venue ? " @ " + event.venue : ""}${event.date_label ? " (" + event.date_label + ")" : ""}.` +
      (data.name ? ` Name: ${data.name.trim()}.` : "") +
      (data.guests ? ` Guests: ${data.guests}.` : "")
    );

  return (
    <div className={`ep-overlay${open ? " is-open" : ""}`} role="dialog" aria-modal="true" aria-label={`${event.title} — guest list`}>
      <style>{styles}</style>
      <div className="ep-backdrop" onClick={dismiss} />
      <div className="ep-card" ref={cardRef}>
        <button className="ep-x" onClick={dismiss} aria-label="Close">&times;</button>

        {showBanner && (
          <img
            className="ep-banner"
            src={event.banner_url}
            alt={event.title}
            width="1200"
            height="800"
            onError={() => setBannerOk(false)}
          />
        )}

        <div className={`ep-head${showBanner ? "" : " ep-head--noimg"}`}>
          <span className="ep-eyebrow">Guest List</span>
          {!showBanner && <h2 className="ep-title">{event.title}</h2>}
          {(event.venue || event.area) && (
            <p className="ep-venue">@ {event.venue}{event.area ? " · " + event.area : ""}</p>
          )}
          <div className="ep-meta">
            {event.date_label && <span>🗓 {event.date_label}</span>}
            {event.time_label && <span>🕘 {event.time_label}</span>}
          </div>
          {event.lineup && <p className="ep-lineup">{event.lineup}</p>}
          {event.genre && <p className="ep-genre">{event.genre}</p>}
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
            <label className="ep-consent">
              <input type="checkbox" checked={data.consent}
                onChange={(e) => setData({ ...data, consent: e.target.checked })} />
              <span>Message me on WhatsApp with event details, reminders and a note after the night.</span>
            </label>
            <button type="submit" className="ep-submit" disabled={submitting}>
              {submitting ? "Adding you…" : "Get on the Guest List →"}
            </button>
            <p className="ep-fine">We'll WhatsApp you the details before the event. Reply STOP anytime to opt out.</p>
          </form>
        )}

        {phase === "closed" && (
          <div className="ep-closed">
            <p className="ep-closed-lead">Guest-list RSVPs are closed — but the night's on.</p>
            <p className="ep-closed-sub">
              Doors {event.time_label || "open soon"}{event.venue ? " at " + event.venue : ""}{event.area ? ", " + event.area : ""}. Walk in, or message us to sort entry.
            </p>
            <a className="ep-wa" href={waHref} target="_blank" rel="noopener noreferrer" data-loc="event_popup">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12.004 0C5.374 0 0 5.373 0 12c0 2.139.561 4.14 1.538 5.878L0 24l6.305-1.511A11.95 11.95 0 0 0 12.004 24C18.63 24 24 18.627 24 12c0-6.628-5.371-12-11.996-12z"/></svg>
              Message on WhatsApp
            </a>
          </div>
        )}

        {phase === "thanks" && (
          <div className="ep-thanks">
            <div className="ep-tick">✓</div>
            <p className="ep-thanks-lead">You're on the list!</p>
            <p className="ep-thanks-sub">See you at {event.venue || "the event"}. Tap below to confirm on WhatsApp so we have you saved.</p>
            <a className="ep-wa" href={waHref} target="_blank" rel="noopener noreferrer" data-loc="event_popup">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12.004 0C5.374 0 0 5.373 0 12c0 2.139.561 4.14 1.538 5.878L0 24l6.305-1.511A11.95 11.95 0 0 0 12.004 24C18.63 24 24 18.627 24 12c0-6.628-5.371-12-11.996-12z"/></svg>
              Confirm on WhatsApp
            </a>
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
.ep-x{position:absolute;top:.6rem;right:.6rem;width:32px;height:32px;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);border:none;border-radius:50%;color:rgba(255,255,255,.85);font-size:1.5rem;line-height:1;cursor:pointer;z-index:3;transition:color .2s,background .2s;}
.ep-x:hover{color:#fff;background:rgba(0,0,0,0.7);}
.ep-banner{display:block;width:100%;height:auto;aspect-ratio:3/2;object-fit:cover;background:#0a0a0a;}
.ep-head{padding:1.2rem 1.6rem 1.1rem;text-align:center;border-bottom:1px solid #1c1c1c;}
.ep-head--noimg{padding-top:1.9rem;background:radial-gradient(ellipse 90% 70% at 50% 0%,rgba(201,168,76,0.16),transparent 70%);}
.ep-eyebrow{display:inline-block;font-size:.6rem;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:#c9a84c;margin-bottom:.6rem;}
.ep-title{font-family:'Bebas Neue',sans-serif;font-size:3rem;line-height:.95;letter-spacing:.04em;color:#fff;margin:0;}
.ep-venue{font-size:.85rem;color:rgba(255,255,255,.7);margin:.35rem 0 .8rem;}
.ep-meta{display:flex;gap:1.1rem;justify-content:center;flex-wrap:wrap;font-size:.78rem;color:rgba(255,255,255,.78);}
.ep-lineup{font-family:'Bebas Neue',sans-serif;font-size:1.6rem;letter-spacing:.08em;color:#e2c475;margin:.9rem 0 .15rem;}
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
.ep-consent{display:flex;gap:.5rem;align-items:flex-start;font-size:.72rem;line-height:1.45;color:rgba(255,255,255,.55);cursor:pointer;margin-top:.2rem;}
.ep-consent input{margin-top:.15rem;accent-color:#c9a84c;flex-shrink:0;}
.ep-submit{margin-top:.4rem;background:#c9a84c;color:#000;border:none;padding:.85rem 1rem;font-family:'Bebas Neue',sans-serif;font-size:1.15rem;letter-spacing:.08em;text-transform:uppercase;border-radius:4px;cursor:pointer;transition:background .2s;}
.ep-submit:hover{background:#e2c475;}
.ep-submit:disabled{opacity:.6;cursor:default;}
.ep-fine{font-size:.68rem;color:rgba(255,255,255,.4);text-align:center;margin:.5rem 0 0;}
.ep-closed,.ep-thanks{padding:1.4rem 1.6rem 1.8rem;text-align:center;display:flex;flex-direction:column;align-items:center;gap:.6rem;}
.ep-closed-lead,.ep-thanks-lead{font-family:'Bebas Neue',sans-serif;font-size:1.5rem;letter-spacing:.03em;color:#fff;margin:0;}
.ep-closed-sub,.ep-thanks-sub{font-size:.85rem;color:rgba(255,255,255,.6);line-height:1.6;margin:0;max-width:34ch;}
.ep-tick{width:54px;height:54px;border-radius:50%;background:rgba(201,168,76,.15);border:1px solid rgba(201,168,76,.5);color:#c9a84c;display:flex;align-items:center;justify-content:center;font-size:1.6rem;}
.ep-wa{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;margin-top:.5rem;background:#c9a84c;color:#0a0a0a;font-weight:700;font-size:.8rem;letter-spacing:.07em;text-transform:uppercase;text-decoration:none;padding:.8rem 1.5rem;border-radius:5px;transition:background .2s,transform .15s;}
.ep-wa:hover{background:#e2c475;color:#0a0a0a;transform:translateY(-1px);}
.ep-wa svg{width:16px;height:16px;flex-shrink:0;}
.ep-dismiss-link{background:none;border:none;color:rgba(255,255,255,.4);font-size:.75rem;text-decoration:underline;cursor:pointer;margin-top:.2rem;}
@media (max-width:480px){
  .ep-overlay{align-items:flex-end;padding:0;}
  .ep-card{width:100%;max-height:94vh;border-radius:14px 14px 0 0;border-bottom:none;}
  .ep-banner{aspect-ratio:2/1;}
  .ep-head{padding:.85rem 1.3rem .75rem;}
  .ep-meta{gap:.8rem;font-size:.74rem;}
  .ep-lineup{font-size:1.45rem;margin:.55rem 0 .1rem;}
  .ep-genre{font-size:.68rem;}
  .ep-form{padding:.9rem 1.3rem 1.2rem;gap:.5rem;}
  .ep-field input,.ep-field select{padding:.6rem .7rem;font-size:.9rem;}
  .ep-fine{margin-top:.35rem;}
  .ep-title{font-size:2.6rem;}
}
@media (max-width:480px) and (max-height:720px){
  .ep-card{max-height:96vh;}
  .ep-banner{aspect-ratio:5/2;}
  .ep-head{padding:.6rem 1.3rem .5rem;}
  .ep-eyebrow{margin-bottom:.3rem;}
  .ep-venue{margin:.25rem 0 .5rem;}
  .ep-lineup{margin:.4rem 0 .05rem;font-size:1.35rem;}
  .ep-genre{display:none;}
  .ep-form{gap:.42rem;padding:.7rem 1.3rem 1rem;}
  .ep-field input,.ep-field select{padding:.5rem .7rem;}
}
@media (prefers-reduced-motion: reduce){
  .ep-backdrop,.ep-card{transition:none;}
  .ep-card{transform:none;}
}
`;
