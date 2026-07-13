import React, { useState, useEffect, useRef } from "react";

// Live "the room so far" social proof for the DJ Collective landing page.
// Pulls aggregate-only stats (no PII) from the dj_collective_stats RPC and
// animates counters + bars in on scroll. Self-contained styles (Astro island).

const SUPABASE_URL = import.meta.env?.PUBLIC_SUPABASE_URL || "https://jftnhuutttmccmqnnybf.supabase.co";
const SUPABASE_KEY = import.meta.env?.PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_ysWygc3QGKbfsUd0f7Evzw__98TEoo9";

function CountUp({ to, shown, suffix = "" }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!shown) return;
    let raf, start;
    const dur = 1100;
    const tick = (t) => {
      if (!start) start = t;
      const p = Math.min((t - start) / dur, 1);
      setN(Math.round((1 - Math.pow(1 - p, 3)) * to)); // easeOutCubic
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [shown, to]);
  return <span>{n}{suffix}</span>;
}

export default function CollectiveStats({ session = null }) {
  const [s, setS] = useState(null);
  const [shown, setShown] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    fetch(`${SUPABASE_URL}/rest/v1/rpc/dj_collective_stats`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_session: session }),
    }).then((r) => (r.ok ? r.json() : null)).then(setS).catch(() => {});
  }, [session]);

  useEffect(() => {
    if (!ref.current) return;
    const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) { setShown(true); io.disconnect(); } }, { threshold: 0.2 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [s]);

  if (!s) return <div className="cs" ref={ref} style={{ minHeight: 120 }} />;

  const gTop = Math.max(...(s.genres || []).map((g) => g.count), 1);
  const eTop = Math.max(...(s.experience || []).map((e) => e.count), 1);

  return (
    <div className="cs" ref={ref}>
      <style>{styles}</style>
      <div className="cs-counters">
        <div className="cs-counter"><span className="cs-num"><CountUp to={s.total} shown={shown} /></span><span className="cs-lbl">DJs already in</span></div>
        <div className="cs-counter"><span className="cs-num"><CountUp to={s.genre_count} shown={shown} /></span><span className="cs-lbl">Genres in the room</span></div>
        <div className="cs-counter"><span className="cs-num">&lt;2 → 15+</span><span className="cs-lbl">Years of experience</span></div>
      </div>

      <div className="cs-charts">
        <div className="cs-chart">
          <h4>Top genres</h4>
          {(s.genres || []).map((g) => (
            <div className="cs-bar" key={g.label}>
              <span className="cs-bar-label" title={g.label}>{g.label}</span>
              <span className="cs-bar-track"><span className="cs-bar-fill" style={{ width: shown ? `${Math.round((g.count / gTop) * 100)}%` : 0 }} /></span>
              <span className="cs-bar-num">{g.count}</span>
            </div>
          ))}
        </div>
        <div className="cs-chart">
          <h4>Experience in the room</h4>
          <p className="cs-chart-note">Newcomers and veterans, side by side — the whole point.</p>
          {(s.experience || []).map((e) => (
            <div className="cs-bar" key={e.label}>
              <span className="cs-bar-label">{e.label}</span>
              <span className="cs-bar-track"><span className="cs-bar-fill cs-bar-fill--exp" style={{ width: shown ? `${Math.round((e.count / eTop) * 100)}%` : 0 }} /></span>
              <span className="cs-bar-num">{e.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles = `
.cs { font-family: 'Inter', sans-serif; }
.cs-counters { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 1.6rem; }
.cs-counter { background: #0e0e0e; border: 1px solid #232323; border-radius: 10px; padding: 1.3rem .8rem; text-align: center; display: flex; flex-direction: column; gap: .3rem; }
.cs-num { font-family: 'Oswald', sans-serif; font-weight: 700; font-size: clamp(1.8rem, 6vw, 2.8rem); line-height: 1; color: #C9A84C; }
.cs-lbl { font-size: .64rem; letter-spacing: .1em; text-transform: uppercase; color: rgba(224,220,207,.55); }
.cs-charts { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
.cs-chart { background: #0e0e0e; border: 1px solid #232323; border-radius: 10px; padding: 1.2rem 1.3rem; }
.cs-chart h4 { font-family: 'Oswald', sans-serif; font-weight: 600; font-size: .78rem; letter-spacing: .18em; text-transform: uppercase; color: #C9A84C; margin: 0 0 .3rem; }
.cs-chart-note { font-family: 'Lora', serif; font-style: italic; font-size: .8rem; color: rgba(224,220,207,.5); margin: 0 0 .9rem; line-height: 1.4; }
.cs-bar { display: flex; align-items: center; gap: 10px; padding: 4px 0; }
.cs-bar-label { flex: 0 0 34%; min-width: 78px; font-size: .78rem; color: rgba(224,220,207,.82); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cs-bar-track { flex: 1; height: 9px; background: #1a1a1a; border-radius: 5px; overflow: hidden; }
.cs-bar-fill { display: block; height: 100%; background: linear-gradient(90deg, #a8842f, #C9A84C); border-radius: 5px; transition: width 1.1s cubic-bezier(.2,.7,.2,1); }
.cs-bar-fill--exp { background: linear-gradient(90deg, #7a5cff, #C9A84C); }
.cs-bar-num { flex: 0 0 auto; min-width: 26px; text-align: right; font-weight: 700; font-size: .82rem; color: #E0DCCF; }
@media (max-width: 640px) {
  .cs-charts { grid-template-columns: 1fr; }
  .cs-counter { padding: 1rem .5rem; }
}
`;
