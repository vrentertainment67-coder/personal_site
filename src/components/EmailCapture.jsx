import React, { useState } from "react";

// ============================================================
// DJ VIC — email capture (newsletter / drop alerts opt-in).
// Posts to the `email-capture` edge function → MailerLite.
// Self-contained styles because Astro scopes page CSS away from
// React islands. Drop in anywhere:
//   <EmailCapture client:visible source="footer" />
//   <EmailCapture client:visible source="vicfix" variant="card"
//       heading="Never miss an episode"
//       sub="New VIC Fix conversations, straight to your inbox." />
// ============================================================
const SUPABASE_URL =
  import.meta.env?.PUBLIC_SUPABASE_URL || "https://jftnhuutttmccmqnnybf.supabase.co";
const ENDPOINT = `${SUPABASE_URL}/functions/v1/email-capture`;

export default function EmailCapture({
  source = "website",
  variant = "inline", // "inline" | "card"
  heading = "Stay in the loop",
  sub = "New mixes, VIC Fix episodes & event drops — no spam, ever.",
  cta = "Subscribe",
}) {
  const [email, setEmail] = useState("");
  const [hp, setHp] = useState(""); // honeypot
  const [state, setState] = useState("idle"); // idle | loading | done | error
  const [msg, setMsg] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (state === "loading" || state === "done") return;
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setState("error");
      setMsg("Please enter a valid email.");
      return;
    }
    setState("loading");
    setMsg("");
    try {
      const r = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value, source, hp }),
      });
      if (r.ok) {
        setState("done");
        setMsg("You're on the list. 🎧");
        setEmail("");
      } else {
        setState("error");
        setMsg("Something went wrong — try again in a moment.");
      }
    } catch {
      setState("error");
      setMsg("Network hiccup — please try again.");
    }
  }

  return (
    <div className={`ec ec--${variant}`}>
      <style>{styles}</style>
      {variant === "card" && (
        <div className="ec-head">
          <h3 className="ec-title">{heading}</h3>
          <p className="ec-sub">{sub}</p>
        </div>
      )}
      {state === "done" ? (
        <p className="ec-done" role="status">{msg}</p>
      ) : (
        <form className="ec-form" onSubmit={submit} noValidate>
          {/* Honeypot — hidden from humans, catches bots */}
          <input
            type="text"
            name="company"
            tabIndex={-1}
            autoComplete="off"
            value={hp}
            onChange={(e) => setHp(e.target.value)}
            className="ec-hp"
            aria-hidden="true"
          />
          <label className="ec-srlabel" htmlFor={`ec-email-${source}`}>
            Email address
          </label>
          <input
            id={`ec-email-${source}`}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => { setEmail(e.target.value); if (state === "error") setState("idle"); }}
            className="ec-input"
            required
          />
          <button type="submit" className="ec-btn" disabled={state === "loading"}>
            {state === "loading" ? "…" : cta}
          </button>
        </form>
      )}
      {state === "error" && <p className="ec-err" role="alert">{msg}</p>}
    </div>
  );
}

const styles = `
.ec{font-family:'Space Grotesk',sans-serif;width:100%;}
.ec--card{background:#0e0e0e;border:1px solid #1e1e1e;padding:2rem 1.75rem;}
.ec-head{margin-bottom:1.1rem;}
.ec-title{font-family:'Bebas Neue',sans-serif;font-size:1.6rem;letter-spacing:.04em;color:#fff;margin:0 0 .35rem;}
.ec-sub{font-size:.85rem;color:rgba(255,255,255,0.55);line-height:1.6;margin:0;}
.ec-form{display:flex;gap:.5rem;flex-wrap:wrap;}
.ec-input{flex:1;min-width:0;background:#080808;border:1px solid #2a2a2a;color:#fff;padding:.8rem 1rem;font-size:.9rem;font-family:inherit;border-radius:3px;transition:border-color .2s;}
.ec-input:focus{outline:none;border-color:#c9a84c;}
.ec-input::placeholder{color:rgba(255,255,255,0.35);}
.ec-btn{background:#c9a84c;color:#000;border:none;padding:.8rem 1.4rem;font-family:'Bebas Neue',sans-serif;font-size:1rem;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;border-radius:3px;transition:background .2s;white-space:nowrap;}
.ec-btn:hover{background:#e2c475;}
.ec-btn:disabled{opacity:.6;cursor:default;}
.ec-hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;}
.ec-srlabel{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;}
.ec-done{font-size:.95rem;color:#c9a84c;font-weight:500;margin:0;padding:.4rem 0;}
.ec-err{font-size:.8rem;color:#ff8a8a;margin:.6rem 0 0;}
@media(max-width:480px){.ec-form{flex-direction:column;}.ec-btn{width:100%;}}
`;
