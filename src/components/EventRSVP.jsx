import React, { useState } from "react";

// ============================================================
// Inline event guest-list RSVP (for a dedicated event page).
// Same data path as the homepage EventPopup — writes to Supabase
// `event_rsvps` (anon insert) and pings VIC's phone via ntfy — but
// rendered inline on the page instead of as a modal. Event details are
// passed in as props (baked from the page). Phases: form -> thanks,
// or closed / over based on the RSVP cutoff + expiry timestamps.
// Self-contained styles — Astro scopes page CSS away from islands.
// ============================================================

const SUPABASE_URL =
  import.meta.env?.PUBLIC_SUPABASE_URL || "https://jftnhuutttmccmqnnybf.supabase.co";
const SUPABASE_KEY =
  import.meta.env?.PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_ysWygc3QGKbfsUd0f7Evzw__98TEoo9";
const NTFY_TOPIC = "djvic-bookings-7k9f3hQ2pX8mN5vR";
const WHATSAPP = "919611711677";

const WaIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12.004 0C5.374 0 0 5.373 0 12c0 2.139.561 4.14 1.538 5.878L0 24l6.305-1.511A11.95 11.95 0 0 0 12.004 24C18.63 24 24 18.627 24 12c0-6.628-5.371-12-11.996-12z"/></svg>
);

export default function EventRSVP({ slug, title, venue, area, dateLabel, timeLabel, rsvpCutoff, expiry }) {
  const startPhase = () => {
    const now = Date.now();
    if (expiry && now >= Date.parse(expiry)) return "over";
    if (rsvpCutoff && now >= Date.parse(rsvpCutoff)) return "closed";
    return "form";
  };
  const [phase, setPhase] = useState(startPhase);
  const [data, setData] = useState({ name: "", phone: "", guests: "2", entry: "", instagram: "", company: "" });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  const waHref =
    `https://wa.me/${WHATSAPP}?text=` +
    encodeURIComponent(
      `Hi VIC! I'd like to be on the guest list for ${title}${venue ? " @ " + venue : ""}${dateLabel ? " (" + dateLabel + ")" : ""}.` +
      (data.name ? ` Name: ${data.name.trim()}.` : "") +
      (data.guests ? ` Guests: ${data.guests}.` : "")
    );
  const waNext =
    `https://wa.me/${WHATSAPP}?text=` +
    encodeURIComponent(`Hi VIC! Let me know when the next ${title} is happening — I'd like to be on the guest list.`);

  async function submit(e) {
    e.preventDefault();
    if (submitting) return;
    if (data.company) { setPhase("thanks"); return; }   // honeypot tripped
    const name = data.name.trim();
    const phone = data.phone.trim();
    if (name.length < 2) return setErr("Please enter your name.");
    if (phone.replace(/\D/g, "").length < 8) return setErr("Please enter a valid phone number.");
    setErr("");
    setSubmitting(true);

    const row = {
      event: slug, name, phone,
      guests: parseInt(data.guests, 10) || 1,
      entry_type: data.entry || null,
      instagram: data.instagram.trim() || null,
      source: "chamatkar-page",
      user_agent: navigator.userAgent.slice(0, 300),
    };

    let ok = false;
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/event_rsvps`, {
        method: "POST",
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify(row),
      });
      ok = r.ok;
    } catch {}
    setSubmitting(false);

    if (ok) {
      try {
        const body =
          `Name: ${name}\nPhone: ${phone}\nGuests: ${row.guests}` +
          (row.entry_type ? `\nEntry: ${row.entry_type}` : "") +
          (row.instagram ? `\nInstagram: ${row.instagram}` : "") +
          `\n\n${title} @ ${venue || ""}`;
        const url = `https://ntfy.sh/${NTFY_TOPIC}?title=${encodeURIComponent("🎉 " + title + " RSVP — " + name)}&priority=4&tags=tada,studio_microphone`;
        navigator.sendBeacon(url, new Blob([body], { type: "text/plain" }));
      } catch {}
      setPhase("thanks");
    } else {
      setErr("Couldn't submit — please try again, or WhatsApp us below.");
    }
  }

  return (
    <div className="er">
      <style>{styles}</style>

      {phase === "form" && (
        <form className="er-form" onSubmit={submit} noValidate>
          <input type="text" name="company" className="er-hp" tabIndex={-1} autoComplete="off" aria-hidden="true"
            value={data.company} onChange={(e) => setData({ ...data, company: e.target.value })} />
          <label className="er-field">
            <span>Name *</span>
            <input type="text" value={data.name} required autoComplete="name"
              onChange={(e) => setData({ ...data, name: e.target.value })} placeholder="Your name" />
          </label>
          <label className="er-field">
            <span>Phone / WhatsApp *</span>
            <input type="tel" inputMode="tel" value={data.phone} required autoComplete="tel"
              onChange={(e) => setData({ ...data, phone: e.target.value.replace(/[^\d+\s()-]/g, "") })} placeholder="+91 ..." />
          </label>
          <div className="er-row">
            <label className="er-field er-field--sm">
              <span>Guests</span>
              <select value={data.guests} onChange={(e) => setData({ ...data, guests: e.target.value })}>
                {["1", "2", "3", "4", "5", "6", "7", "8+"].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label className="er-field er-field--sm">
              <span>Entry</span>
              <select value={data.entry} onChange={(e) => setData({ ...data, entry: e.target.value })}>
                <option value="">—</option>
                <option value="couple">Couple</option>
                <option value="stag">Stag</option>
                <option value="mixed">Mixed group</option>
              </select>
            </label>
          </div>
          <label className="er-field">
            <span>Instagram <em>(optional)</em></span>
            <input type="text" value={data.instagram} autoComplete="off"
              onChange={(e) => setData({ ...data, instagram: e.target.value })} placeholder="@handle" />
          </label>
          {err && <p className="er-err" role="alert">{err}</p>}
          <button type="submit" className="er-submit" disabled={submitting}>
            {submitting ? "Adding you…" : "Get on the Guest List →"}
          </button>
          <p className="er-fine">We'll WhatsApp you the details before the night.</p>
        </form>
      )}

      {phase === "closed" && (
        <div className="er-msg">
          <p className="er-msg-lead">Guest-list RSVPs are closed — but the night's on.</p>
          <p className="er-msg-sub">Doors {timeLabel || "open soon"}{venue ? " at " + venue : ""}{area ? ", " + area : ""}. Walk in, or message us to sort entry.</p>
          <a className="er-wa" href={waHref} target="_blank" rel="noopener noreferrer" data-loc="chamatkar_page"><WaIcon /> Message on WhatsApp</a>
        </div>
      )}

      {phase === "thanks" && (
        <div className="er-msg">
          <div className="er-tick">✓</div>
          <p className="er-msg-lead">You're on the list!</p>
          <p className="er-msg-sub">See you at {venue || "the venue"}{dateLabel ? ", " + dateLabel : ""}. Tap below to confirm on WhatsApp so we have you saved.</p>
          <a className="er-wa" href={waHref} target="_blank" rel="noopener noreferrer" data-loc="chamatkar_page"><WaIcon /> Confirm on WhatsApp</a>
        </div>
      )}

      {phase === "over" && (
        <div className="er-msg">
          <p className="er-msg-lead">This edition has wrapped.</p>
          <p className="er-msg-sub">Relive it in the photos &amp; clips below — and message us to be first on the list for the next {title}.</p>
          <a className="er-wa" href={waNext} target="_blank" rel="noopener noreferrer" data-loc="chamatkar_page"><WaIcon /> Tell me about the next one</a>
        </div>
      )}
    </div>
  );
}

const styles = `
.er{width:100%;max-width:440px;margin:0 auto;font-family:'Space Grotesk',sans-serif;}
.er-form{display:flex;flex-direction:column;gap:.7rem;background:#0c0c0c;border:1px solid rgba(201,168,76,0.3);border-radius:10px;padding:1.4rem 1.5rem 1.6rem;}
.er-field{display:flex;flex-direction:column;gap:.3rem;font-size:.72rem;letter-spacing:.04em;text-transform:uppercase;color:rgba(255,255,255,.55);}
.er-field em{text-transform:none;letter-spacing:0;color:rgba(255,255,255,.35);font-style:italic;}
.er-field input,.er-field select{background:#080808;border:1px solid #2a2a2a;color:#fff;padding:.7rem .8rem;font-size:.92rem;font-family:inherit;border-radius:4px;text-transform:none;letter-spacing:normal;transition:border-color .2s;}
.er-field input:focus,.er-field select:focus{outline:none;border-color:#c9a84c;}
.er-field input::placeholder{color:rgba(255,255,255,.3);}
.er-row{display:flex;gap:.7rem;}
.er-field--sm{flex:1;}
.er-hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;}
.er-err{font-size:.78rem;color:#ff8a8a;margin:.1rem 0 0;}
.er-submit{margin-top:.4rem;background:#c9a84c;color:#000;border:none;padding:.9rem 1rem;font-family:'Bebas Neue',sans-serif;font-size:1.2rem;letter-spacing:.08em;text-transform:uppercase;border-radius:4px;cursor:pointer;transition:background .2s;}
.er-submit:hover{background:#e2c475;}
.er-submit:disabled{opacity:.6;cursor:default;}
.er-fine{font-size:.68rem;color:rgba(255,255,255,.4);text-align:center;margin:.5rem 0 0;}
.er-msg{background:#0c0c0c;border:1px solid rgba(201,168,76,0.3);border-radius:10px;padding:1.8rem 1.6rem;text-align:center;display:flex;flex-direction:column;align-items:center;gap:.7rem;}
.er-msg-lead{font-family:'Bebas Neue',sans-serif;font-size:1.7rem;letter-spacing:.03em;color:#fff;margin:0;}
.er-msg-sub{font-size:.88rem;color:rgba(255,255,255,.6);line-height:1.6;margin:0;max-width:36ch;}
.er-tick{width:54px;height:54px;border-radius:50%;background:rgba(201,168,76,.15);border:1px solid rgba(201,168,76,.5);color:#c9a84c;display:flex;align-items:center;justify-content:center;font-size:1.6rem;}
.er-wa{display:inline-flex;align-items:center;justify-content:center;gap:.55rem;margin-top:.4rem;background:#c9a84c;color:#0a0a0a;font-weight:700;font-size:.82rem;letter-spacing:.06em;text-transform:uppercase;text-decoration:none;padding:.85rem 1.5rem;border-radius:5px;transition:background .2s,transform .15s;}
.er-wa:hover{background:#e2c475;transform:translateY(-1px);}
.er-wa svg{width:17px;height:17px;flex-shrink:0;}
@media (max-width:480px){
  .er-form{padding:1.1rem 1.2rem 1.3rem;}
}
`;
