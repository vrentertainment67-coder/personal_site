import React, { useEffect, useMemo, useRef, useState } from "react";

// ============================================================
// Live footage showreel (client-facing, on the unlisted /live page).
// Reads public.live_videos (anon select), groups by language into tabs.
// Pick a language → a strip of clips shows up top → the selected one plays
// in the big player below. No redeploy needed: it loads live from Supabase.
// ============================================================

const SUPABASE_URL =
  import.meta.env?.PUBLIC_SUPABASE_URL || "https://jftnhuutttmccmqnnybf.supabase.co";
const SUPABASE_KEY =
  import.meta.env?.PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_ysWygc3QGKbfsUd0f7Evzw__98TEoo9";

// Preferred tab order; anything else falls in after these, alphabetically.
const LANG_ORDER = ["Tamil", "Telugu", "Kannada", "Malayalam", "Hindi", "English", "Punjabi", "Marathi", "Bengali"];

export default function LiveVideos() {
  const [rows, setRows] = useState(null);   // null = loading
  const [lang, setLang] = useState(null);
  const [sel, setSel] = useState(null);
  const videoRef = useRef(null);

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const r = await fetch(
          `${SUPABASE_URL}/rest/v1/live_videos?select=*&order=sort_order.asc,created_at.asc`,
          { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
        );
        const data = r.ok ? await r.json() : [];
        if (on) setRows(Array.isArray(data) ? data : []);
      } catch { if (on) setRows([]); }
    })();
    return () => { on = false; };
  }, []);

  // Languages present, in preferred order.
  const langs = useMemo(() => {
    if (!rows) return [];
    const present = [...new Set(rows.map((r) => r.language).filter(Boolean))];
    return present.sort((a, b) => {
      const ia = LANG_ORDER.indexOf(a), ib = LANG_ORDER.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [rows]);

  // Pick the first language + its first clip once loaded.
  useEffect(() => {
    if (langs.length && !lang) setLang(langs[0]);
  }, [langs, lang]);

  const clips = useMemo(
    () => (rows && lang ? rows.filter((r) => r.language === lang) : []),
    [rows, lang]
  );

  useEffect(() => {
    // When the language changes, jump to its first clip.
    if (clips.length) setSel((prev) => (prev && clips.some((c) => c.id === prev.id) ? prev : clips[0]));
    else setSel(null);
  }, [clips]);

  const play = (clip) => {
    setSel(clip);
    // Selecting is a user gesture, so playback with sound is allowed.
    requestAnimationFrame(() => { try { videoRef.current?.play?.(); } catch {} });
  };

  if (rows === null) {
    return (<div className="lv"><style>{styles}</style><div className="lv-load">Loading footage…</div></div>);
  }

  if (!rows.length) {
    return (
      <div className="lv"><style>{styles}</style>
        <div className="lv-empty">Footage is being added — check back shortly, or ask VIC for the latest clips.</div>
      </div>
    );
  }

  return (
    <div className="lv">
      <style>{styles}</style>

      {/* Language tabs */}
      <div className="lv-tabs" role="tablist">
        {langs.map((l) => (
          <button key={l} role="tab" aria-selected={l === lang}
            className={l === lang ? "lv-tab on" : "lv-tab"} onClick={() => setLang(l)}>
            {l}
          </button>
        ))}
      </div>

      {/* Thumbnail strip */}
      <div className="lv-strip">
        {clips.map((c) => (
          <button key={c.id} className={sel && c.id === sel.id ? "lv-thumb on" : "lv-thumb"} onClick={() => play(c)}
            title={c.title || ""}>
            <span className="lv-thumb-img">
              {c.thumbnail_url
                ? <img src={c.thumbnail_url} alt="" loading="lazy" />
                : <span className="lv-thumb-ph">▶</span>}
              <span className="lv-thumb-play">▶</span>
            </span>
            {c.title && <span className="lv-thumb-t">{c.title}</span>}
          </button>
        ))}
      </div>

      {/* Primary player */}
      <div className="lv-player">
        {sel ? (
          <video ref={videoRef} key={sel.id} src={sel.url} poster={sel.thumbnail_url || undefined}
            controls playsInline preload="metadata" />
        ) : (
          <div className="lv-player-empty">No clips in {lang} yet.</div>
        )}
      </div>
      {sel && sel.title && <p className="lv-caption">{sel.title}</p>}
    </div>
  );
}

const styles = `
.lv { max-width: 1000px; margin: 0 auto; }
.lv-load, .lv-empty { text-align: center; color: rgba(255,255,255,.5); padding: 3rem 1rem; font-size: .95rem; }
.lv-tabs { display: flex; flex-wrap: wrap; gap: .5rem; justify-content: center; margin-bottom: 1.25rem; }
.lv-tab { background: #0e0e10; border: 1.5px solid #262626; color: #b8b4a8; font: inherit; font-size: .82rem;
  font-weight: 600; letter-spacing: .04em; padding: .55rem 1.15rem; border-radius: 99px; cursor: pointer; transition: .15s; }
.lv-tab:hover { border-color: #4a4a4a; color: #e8e8e0; }
.lv-tab.on { background: var(--gold, #c9a84c); border-color: var(--gold, #c9a84c); color: #161208; }
.lv-strip { display: flex; gap: .6rem; overflow-x: auto; padding: 0 .1rem .6rem; margin-bottom: 1rem;
  scrollbar-width: thin; scroll-snap-type: x proximity; }
.lv-strip::-webkit-scrollbar { height: 6px; }
.lv-strip::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 3px; }
.lv-thumb { flex: 0 0 auto; width: 140px; background: none; border: none; padding: 0; cursor: pointer;
  scroll-snap-align: start; text-align: left; }
.lv-thumb-img { position: relative; display: block; width: 140px; height: 84px; border-radius: 7px; overflow: hidden;
  background: #0a0a0a; border: 2px solid transparent; transition: border-color .15s; }
.lv-thumb.on .lv-thumb-img { border-color: var(--gold, #c9a84c); }
.lv-thumb-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
.lv-thumb-ph { display: flex; align-items: center; justify-content: center; height: 100%; color: #555; font-size: 1.2rem; }
.lv-thumb-play { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  color: #fff; font-size: 1.1rem; background: rgba(0,0,0,.28); opacity: 0; transition: opacity .15s; }
.lv-thumb:hover .lv-thumb-play, .lv-thumb.on .lv-thumb-play { opacity: 1; }
.lv-thumb-t { display: block; font-size: .72rem; color: #9a968c; margin-top: .4rem; line-height: 1.3;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lv-thumb.on .lv-thumb-t { color: #e8e8e0; }
.lv-player { position: relative; width: 100%; aspect-ratio: 16 / 9; background: #000; border-radius: 10px;
  overflow: hidden; border: 1px solid #1e1e1e; }
.lv-player video { width: 100%; height: 100%; display: block; background: #000; }
.lv-player-empty { display: flex; align-items: center; justify-content: center; height: 100%; color: rgba(255,255,255,.4); }
.lv-caption { text-align: center; color: #b8b4a8; font-size: .9rem; margin: .9rem 0 0; }
@media (max-width: 560px) { .lv-thumb, .lv-thumb-img { width: 116px; } .lv-thumb-img { height: 70px; } }
`;
