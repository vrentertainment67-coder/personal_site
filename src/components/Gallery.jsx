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

export default function Gallery({ fallback = [], base = "/images/rf/" }) {
  const curated = fallback.map((p) => ({ src: base + p.src, alt: p.alt }));
  const [photos, setPhotos] = useState(curated);
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);

  // Pull admin-uploaded gallery media and put it in front of the curated set.
  useEffect(() => {
    supabase.from("media").select("*").eq("kind", "gallery").order("sort").order("created_at", { ascending: false })
      .then(({ data }) => {
        if (Array.isArray(data) && data.length) {
          const uploaded = data.map((m) => ({ src: m.url, alt: m.public_id || "DJ VIC — live performance" }));
          setPhotos([...uploaded, ...curated]);
        }
      })
      .catch(() => { /* keep curated on error */ });
  }, []); // eslint-disable-line

  const show = useCallback((i) => { setIdx(i); setOpen(true); document.body.style.overflow = "hidden"; }, []);
  const close = useCallback(() => { setOpen(false); document.body.style.overflow = ""; }, []);
  const prev = useCallback(() => setIdx((i) => (i - 1 + photos.length) % photos.length), [photos.length]);
  const next = useCallback(() => setIdx((i) => (i + 1) % photos.length), [photos.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, prev, next]);

  let touchX = 0;

  return (
    <div className="vg-wrap">
      <style>{vgStyles}</style>
      <div className="vg-grid">
        {photos.map((p, i) => (
          <button className="vg-item" key={i} onClick={() => show(i)} aria-label={`View photo — ${p.alt}`}>
            <img src={p.src} alt={p.alt} loading="lazy" width="800" height="600" />
          </button>
        ))}
      </div>

      {open && (
        <div
          className="vg-lb open"
          role="dialog"
          aria-modal="true"
          aria-label="Photo viewer"
          onClick={(e) => { if (e.target === e.currentTarget) close(); }}
          onTouchStart={(e) => { touchX = e.touches[0].clientX; }}
          onTouchEnd={(e) => { const d = touchX - e.changedTouches[0].clientX; if (Math.abs(d) > 50) (d > 0 ? next() : prev()); }}
        >
          <button className="vg-close" onClick={close} aria-label="Close">&times;</button>
          <button className="vg-nav vg-prev" onClick={prev} aria-label="Previous photo">&#8592;</button>
          <button className="vg-nav vg-next" onClick={next} aria-label="Next photo">&#8594;</button>
          <div className="vg-img-wrap">
            <img className="vg-img" src={photos[idx]?.src} alt={photos[idx]?.alt} />
          </div>
          <div className="vg-counter">{idx + 1} / {photos.length}</div>
        </div>
      )}
    </div>
  );
}

const vgStyles = `
.vg-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;}
.vg-item{position:relative;overflow:hidden;aspect-ratio:4/3;background:#111;border:none;padding:0;cursor:zoom-in;display:block;}
.vg-item img{width:100%;height:100%;object-fit:cover;object-position:center 20%;display:block;transition:transform .4s ease;}
.vg-item:hover img{transform:scale(1.05);}
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
