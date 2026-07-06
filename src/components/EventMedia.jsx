import React, { useState, useEffect } from "react";

// ============================================================
// Public event media — reads admin-managed videos (reels) + photos from
// Supabase `event_media` for a given event slug and renders them.
// YouTube / Shorts links, mp4 URLs, or image URLs all supported.
// Self-contained styles — Astro scopes page CSS away from islands.
// ============================================================

const SUPABASE_URL =
  import.meta.env?.PUBLIC_SUPABASE_URL || "https://jftnhuutttmccmqnnybf.supabase.co";
const SUPABASE_KEY =
  import.meta.env?.PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_ysWygc3QGKbfsUd0f7Evzw__98TEoo9";

// Parse a video URL/ID into something renderable.
export function parseVideo(raw) {
  const s = String(raw || "").trim();
  if (/\.(mp4|webm|mov)(\?|#|$)/i.test(s)) return { kind: "file", src: s, portrait: false };
  const short = s.match(/shorts\/([A-Za-z0-9_-]{6,})/);
  if (short) return { kind: "yt", id: short[1], portrait: true };
  const m = s.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{6,})/);
  const id = m ? m[1] : (/^[A-Za-z0-9_-]{6,}$/.test(s) ? s : null);
  if (id) return { kind: "yt", id, portrait: false };
  return { kind: "link", src: s, portrait: false };
}

export default function EventMedia({ slug }) {
  const [rows, setRows] = useState(null); // null = loading

  useEffect(() => {
    let cancelled = false;
    fetch(`${SUPABASE_URL}/rest/v1/event_media?event_slug=eq.${encodeURIComponent(slug)}&select=*&order=sort_order.asc,created_at.asc`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { if (!cancelled) setRows(Array.isArray(d) ? d : []); })
      .catch(() => { if (!cancelled) setRows([]); });
    return () => { cancelled = true; };
  }, [slug]);

  if (rows === null) return null; // brief load — render nothing
  const videos = rows.filter((r) => r.type === "video");
  const photos = rows.filter((r) => r.type === "photo");

  if (videos.length === 0 && photos.length === 0) {
    return <p className="em-soon">📸 Photos &amp; clips are dropping here soon.</p>;
  }

  return (
    <div className="em">
      <style>{styles}</style>

      {videos.length > 0 && (
        <div className="em-videos">
          {videos.map((v) => {
            const p = parseVideo(v.url);
            return (
              <figure className={`em-video${p.portrait ? " em-video--portrait" : ""}`} key={v.id}>
                <div className="em-frame">
                  {p.kind === "yt" && (
                    <iframe
                      src={`https://www.youtube.com/embed/${p.id}?rel=0&modestbranding=1&playsinline=1`}
                      title={v.caption || "Chamatkar reel"} loading="lazy"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                    ></iframe>
                  )}
                  {p.kind === "file" && (
                    <video src={p.src} controls playsInline preload="metadata"></video>
                  )}
                  {p.kind === "link" && (
                    <a className="em-linkout" href={p.src} target="_blank" rel="noopener noreferrer">▶ Watch</a>
                  )}
                </div>
                {v.caption && <figcaption>{v.caption}</figcaption>}
              </figure>
            );
          })}
        </div>
      )}

      {photos.length > 0 && (
        <div className="em-photos">
          {photos.map((ph) => (
            <a className="em-photo" href={ph.url} target="_blank" rel="noopener noreferrer" key={ph.id}>
              <img src={ph.url} alt={ph.caption || "Chamatkar photo"} loading="lazy" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = `
.em{font-family:'Space Grotesk',sans-serif;}
.em-videos{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),1fr));gap:16px;align-items:start;}
.em-video{margin:0;}
.em-frame{position:relative;aspect-ratio:16/9;border-radius:8px;overflow:hidden;border:1px solid rgba(201,168,76,.25);background:#000;}
.em-video--portrait .em-frame{aspect-ratio:9/16;max-width:300px;margin:0 auto;}
.em-frame iframe,.em-frame video{position:absolute;inset:0;width:100%;height:100%;border:0;object-fit:cover;}
.em-linkout{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#c9a84c;font-weight:600;text-decoration:none;letter-spacing:.05em;}
.em-video figcaption{font-size:.82rem;color:rgba(255,255,255,.6);margin-top:.5rem;line-height:1.4;}
.em-photos{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(200px,100%),1fr));gap:10px;margin-top:16px;}
.em-photo{display:block;aspect-ratio:4/5;border-radius:6px;overflow:hidden;border:1px solid #1c1c1c;}
.em-photo img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .4s ease;}
.em-photo:hover img{transform:scale(1.05);}
.em-soon{text-align:center;color:rgba(255,255,255,.45);font-style:italic;border:1px dashed rgba(201,168,76,.25);border-radius:8px;padding:2.2rem 1rem;margin:0;}
`;
