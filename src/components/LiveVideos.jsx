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
const CEREMONY_ORDER = ["Sangeet", "Baraat", "Haldi/Mehendi", "After Party", "Club Night"];
const GROUPINGS = [{ key: "language", label: "By language" }, { key: "ceremony", label: "By ceremony" }];

// A clip's URL can be an uploaded file (Cloudinary mp4) OR a pasted link
// (YouTube / Vimeo / Google Drive) — for clips too big to upload. Work out
// which so the player embeds links and uses the <video> tag for files.
function classify(url) {
  const s = String(url || "");
  const yt = s.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  if (yt) return { kind: "youtube", id: yt[1] };
  const vm = s.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) return { kind: "vimeo", id: vm[1] };
  if (/drive\.google\.com/.test(s)) {
    const dr = s.match(/\/file\/d\/([A-Za-z0-9_-]+)/) || s.match(/[?&]id=([A-Za-z0-9_-]+)/);
    if (dr) return { kind: "drive", id: dr[1] };
  }
  return { kind: "file" };
}
function thumbFor(clip) {
  if (clip.thumbnail_url) return clip.thumbnail_url;
  const c = classify(clip.url);
  if (c.kind === "youtube") return `https://img.youtube.com/vi/${c.id}/hqdefault.jpg`;
  return null;
}

export default function LiveVideos() {
  const [rows, setRows] = useState(null);   // null = loading
  const [groupBy, setGroupBy] = useState("language");   // "language" | "ceremony"
  const [cat, setCat] = useState(null);                  // selected tab value
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

  // Which groupings actually have any tagged videos (so we only show a switcher
  // that leads somewhere). Language is always present; ceremony only once tagged.
  const available = useMemo(() => {
    if (!rows) return ["language"];
    const hasCeremony = rows.some((r) => r.ceremony);
    return hasCeremony ? ["language", "ceremony"] : ["language"];
  }, [rows]);

  // Tab values for the active grouping, in preferred order.
  const ORDER = groupBy === "ceremony" ? CEREMONY_ORDER : LANG_ORDER;
  const cats = useMemo(() => {
    if (!rows) return [];
    const present = [...new Set(rows.map((r) => r[groupBy]).filter(Boolean))];
    return present.sort((a, b) => {
      const ia = ORDER.indexOf(a), ib = ORDER.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [rows, groupBy]);

  // Pick the first tab whenever the grouping changes / loads.
  useEffect(() => {
    if (cats.length && !cats.includes(cat)) setCat(cats[0]);
  }, [cats, cat]);

  const clips = useMemo(
    () => (rows && cat ? rows.filter((r) => r[groupBy] === cat) : []),
    [rows, cat, groupBy]
  );

  useEffect(() => {
    // When the tab changes, jump to its first clip.
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

      {/* Group-by switcher (only when there's more than one way to group) */}
      {available.length > 1 && (
        <div className="lv-groupby">
          {GROUPINGS.filter((g) => available.includes(g.key)).map((g) => (
            <button key={g.key} className={groupBy === g.key ? "lv-gb on" : "lv-gb"}
              onClick={() => { setGroupBy(g.key); setCat(null); }}>{g.label}</button>
          ))}
        </div>
      )}

      {/* Category tabs (language or ceremony) */}
      <div className="lv-tabs" role="tablist">
        {cats.map((l) => (
          <button key={l} role="tab" aria-selected={l === cat}
            className={l === cat ? "lv-tab on" : "lv-tab"} onClick={() => setCat(l)}>
            {l}
          </button>
        ))}
      </div>

      {/* Thumbnail strip */}
      <div className="lv-strip">
        {clips.map((c) => {
          const th = thumbFor(c);
          return (
            <button key={c.id} className={sel && c.id === sel.id ? "lv-thumb on" : "lv-thumb"} onClick={() => play(c)}
              title={c.title || ""}>
              <span className="lv-thumb-img">
                {th ? <img src={th} alt="" loading="lazy" /> : <span className="lv-thumb-ph">▶</span>}
                <span className="lv-thumb-play">▶</span>
              </span>
              {c.title && <span className="lv-thumb-t">{c.title}</span>}
            </button>
          );
        })}
      </div>

      {/* Primary player — embed for links, native <video> for uploaded files */}
      <div className="lv-player">
        {!sel ? (
          <div className="lv-player-empty">No clips in {cat} yet.</div>
        ) : (() => {
          const c = classify(sel.url);
          if (c.kind === "youtube")
            return <iframe key={sel.id} src={`https://www.youtube.com/embed/${c.id}?rel=0&modestbranding=1&playsinline=1&autoplay=1`}
              title={sel.title || "Live footage"} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />;
          if (c.kind === "vimeo")
            return <iframe key={sel.id} src={`https://player.vimeo.com/video/${c.id}?autoplay=1`}
              title={sel.title || "Live footage"} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />;
          if (c.kind === "drive")
            return <iframe key={sel.id} src={`https://drive.google.com/file/d/${c.id}/preview`}
              title={sel.title || "Live footage"} allow="autoplay" allowFullScreen />;
          return <video ref={videoRef} key={sel.id} src={sel.url} poster={sel.thumbnail_url || undefined}
            controls playsInline preload="metadata" />;
        })()}
      </div>
      {sel && sel.title && <p className="lv-caption">{sel.title}</p>}
    </div>
  );
}

const styles = `
.lv { max-width: 1000px; margin: 0 auto; }
.lv-load, .lv-empty { text-align: center; color: rgba(255,255,255,.5); padding: 3rem 1rem; font-size: .95rem; }
.lv-groupby { display: flex; justify-content: center; gap: .4rem; margin-bottom: .9rem; }
.lv-gb { background: none; border: 1px solid #2a2a2a; color: #8a8878; font: inherit; font-size: .68rem;
  font-weight: 600; letter-spacing: .1em; text-transform: uppercase; padding: .4rem .85rem; border-radius: 99px; cursor: pointer; transition: .15s; }
.lv-gb:hover { color: #cfcabf; border-color: #444; }
.lv-gb.on { color: var(--gold, #c9a84c); border-color: rgba(201,168,76,.5); background: rgba(201,168,76,.08); }
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
.lv-player video, .lv-player iframe { width: 100%; height: 100%; display: block; background: #000; border: 0; }
.lv-player-empty { display: flex; align-items: center; justify-content: center; height: 100%; color: rgba(255,255,255,.4); }
.lv-caption { text-align: center; color: #b8b4a8; font-size: .9rem; margin: .9rem 0 0; }
@media (max-width: 560px) { .lv-thumb, .lv-thumb-img { width: 116px; } .lv-thumb-img { height: 70px; } }
`;
