import React, { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

// ============================================================
// DJ VIC — /photos gallery. Renders the curated `fallback` photos
// (passed from photos.astro) and PREPENDS any images uploaded via
// /admin → Media (kind=gallery). Self-contained grid + lightbox
// because Astro scopes the page CSS away from React output.
// ============================================================
const SUPABASE_URL = import.meta.env?.PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env?.PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const isVideo = (url) => /\/video\/upload\//.test(url || "") || /\.(mp4|webm|mov|m4v)$/i.test(url || "");

export default function Gallery({ fallback = [], base = "/images/rf/" }) {
  const curated = fallback.map((p) => ({ src: base + p.src, alt: p.alt, video: false }));
  const [photos, setPhotos] = useState(curated);
  const [filter, setFilter] = useState("all"); // all | photo | video
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);

  // Once the media table is seeded it IS the source of truth — render it exactly
  // so admin deletes/uploads reflect live. Falls back to `curated` only while the
  // table is empty/unreadable (e.g. before the migration SQL is run).
  useEffect(() => {
    supabase.from("media").select("*").eq("kind", "gallery").order("sort").order("created_at", { ascending: false })
      .then(({ data }) => {
        if (Array.isArray(data) && data.length) {
          setPhotos(data.map((m) => ({
            src: m.url,
            alt: m.caption || "DJ VIC — live performance",
            video: isVideo(m.url),
          })));
        }
      })
      .catch(() => { /* keep curated fallback on error */ });
  }, []); // eslint-disable-line

  const hasVideo = photos.some((p) => p.video);
  const visible = photos.filter((p) => (filter === "all" ? true : filter === "video" ? p.video : !p.video));

  const show = (i) => { setIdx(i); setOpen(true); document.body.style.overflow = "hidden"; };
  const close = () => { setOpen(false); document.body.style.overflow = ""; };
  const go = (dir) => setIdx((i) => (i + dir + visible.length) % visible.length);
  const pickFilter = (f) => { setFilter(f); setOpen(false); };

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") setIdx((i) => (i - 1 + visible.length) % visible.length);
      if (e.key === "ArrowRight") setIdx((i) => (i + 1) % visible.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, visible.length]); // eslint-disable-line

  let touchX = 0;
  const cur = visible[idx];

  return (
    <div className="vg-wrap">
      <style>{vgStyles}</style>
      {hasVideo && (
        <div className="vg-tabs">
          {[["all", "All"], ["photo", "Photos"], ["video", "Videos"]].map(([k, label]) => (
            <button key={k} className={filter === k ? "vg-tab on" : "vg-tab"} onClick={() => pickFilter(k)}>{label}</button>
          ))}
        </div>
      )}
      <div className="vg-grid">
        {visible.map((p, i) => (
          <button className="vg-item" key={i} onClick={() => show(i)} aria-label={`View — ${p.alt}`}>
            {p.video
              ? <video src={p.src} muted playsInline preload="metadata" />
              : <img src={p.src} alt={p.alt} loading="lazy" width="800" height="600" />}
            {p.video && <span className="vg-play" aria-hidden="true">▶</span>}
          </button>
        ))}
      </div>

      {open && cur && (
        <div
          className="vg-lb open"
          role="dialog"
          aria-modal="true"
          aria-label="Photo viewer"
          onClick={(e) => { if (e.target === e.currentTarget) close(); }}
          onTouchStart={(e) => { touchX = e.touches[0].clientX; }}
          onTouchEnd={(e) => { const d = touchX - e.changedTouches[0].clientX; if (Math.abs(d) > 50) go(d > 0 ? 1 : -1); }}
        >
          <button className="vg-close" onClick={close} aria-label="Close">&times;</button>
          <button className="vg-nav vg-prev" onClick={() => go(-1)} aria-label="Previous">&#8592;</button>
          <button className="vg-nav vg-next" onClick={() => go(1)} aria-label="Next">&#8594;</button>
          <div className="vg-img-wrap">
            {cur.video
              ? <video className="vg-img" src={cur.src} controls autoPlay playsInline />
              : <img className="vg-img" src={cur.src} alt={cur.alt} />}
          </div>
          <div className="vg-counter">{idx + 1} / {visible.length}</div>
        </div>
      )}
    </div>
  );
}

const vgStyles = `
.vg-tabs{display:flex;gap:8px;justify-content:center;margin-bottom:1.5rem;}
.vg-tab{background:transparent;border:1px solid rgba(255,255,255,.14);color:rgba(255,255,255,.6);font-family:inherit;font-size:.65rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;padding:.5rem 1.15rem;border-radius:999px;cursor:pointer;transition:.18s;}
.vg-tab:hover{border-color:#c9a84c;color:#fff;}
.vg-tab.on{background:#c9a84c;border-color:#c9a84c;color:#0a0a0a;}
.vg-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;}
.vg-item{position:relative;overflow:hidden;aspect-ratio:4/3;background:#111;border:none;padding:0;cursor:zoom-in;display:block;}
.vg-item img,.vg-item video{width:100%;height:100%;object-fit:cover;object-position:center 20%;display:block;transition:transform .4s ease;}
.vg-item:hover img,.vg-item:hover video{transform:scale(1.05);}
.vg-play{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:1.6rem;color:#fff;text-shadow:0 2px 10px rgba(0,0,0,.7);pointer-events:none;}
@media(max-width:900px){.vg-grid{grid-template-columns:repeat(3,1fr);}}
@media(max-width:600px){.vg-grid{grid-template-columns:repeat(2,1fr);}}
@media(max-width:380px){.vg-grid{grid-template-columns:1fr;}}
.vg-lb{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.96);display:flex;flex-direction:column;align-items:center;justify-content:center;}
.vg-img-wrap{display:flex;align-items:center;justify-content:center;width:100%;flex:1;padding:4rem 6rem;box-sizing:border-box;min-height:0;}
.vg-img{max-width:100%;max-height:100%;object-fit:contain;display:block;user-select:none;}
.vg-counter{font-size:.6rem;font-weight:600;letter-spacing:.15em;color:rgba(255,255,255,.3);padding-bottom:.75rem;}
.vg-close{position:fixed;top:1.25rem;right:1.5rem;background:none;border:none;color:rgba(255,255,255,.6);font-size:2.25rem;line-height:1;cursor:pointer;transition:color .2s;z-index:1001;padding:.25rem .5rem;}
.vg-close:hover{color:#fff;}
.vg-nav{position:fixed;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);color:#fff;font-size:1.25rem;width:48px;height:48px;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:background .2s,border-color .2s;z-index:1001;}
.vg-prev{left:1.25rem;}
.vg-next{right:1.25rem;}
.vg-nav:hover{background:rgba(201,168,76,.2);border-color:#c9a84c;color:#c9a84c;}
@media(max-width:600px){.vg-img-wrap{padding:4.5rem 1rem 1rem;}.vg-prev{left:.5rem;}.vg-next{right:.5rem;}}
`;
