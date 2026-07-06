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
  if (/\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(s) || /\/video\/upload\//.test(s)) return { kind: "file", src: s, portrait: false };
  const short = s.match(/shorts\/([A-Za-z0-9_-]{6,})/);
  if (short) return { kind: "yt", id: short[1], portrait: true };
  const m = s.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{6,})/);
  const id = m ? m[1] : (/^[A-Za-z0-9_-]{6,}$/.test(s) ? s : null);
  if (id) return { kind: "yt", id, portrait: false };
  return { kind: "link", src: s, portrait: false };
}

// Uploaded videos (phone reels): size the frame to the video's true aspect
// ratio once metadata loads, so vertical reels aren't cropped into 16:9.
function FileVideo({ src }) {
  const [ar, setAr] = useState(null);
  // Cloudinary auto-generates a poster frame if you swap the extension to .jpg.
  const poster = src.replace(/\.(mp4|webm|mov|m4v)(\?|#|$)/i, ".jpg$2");
  return (
    <div className="em-frame em-frame--file" style={ar ? { aspectRatio: ar } : undefined}>
      <video src={src} poster={poster !== src ? poster : undefined} controls playsInline preload="metadata"
        onLoadedMetadata={(e) => { const v = e.currentTarget; if (v.videoWidth && v.videoHeight) setAr(`${v.videoWidth} / ${v.videoHeight}`); }} />
    </div>
  );
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

  const renderVideo = (v) => {
    const p = parseVideo(v.url);
    return (
      <figure className={`em-video${p.portrait ? " em-video--portrait" : ""}`} key={v.id}>
        {p.kind === "yt" && (
          <div className="em-frame">
            <iframe
              src={`https://www.youtube.com/embed/${p.id}?rel=0&modestbranding=1&playsinline=1`}
              title={v.caption || "reel"} loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            ></iframe>
          </div>
        )}
        {p.kind === "file" && <FileVideo src={p.src} />}
        {p.kind === "link" && (
          <div className="em-frame"><a className="em-linkout" href={p.src} target="_blank" rel="noopener noreferrer">▶ Watch</a></div>
        )}
        {v.caption && <figcaption>{v.caption}</figcaption>}
      </figure>
    );
  };

  // Showcase: the landscape YouTube feature sits centred, the reels (anything
  // vertical — uploads OR YouTube Shorts) split to the sides at a smaller size.
  // Falls back to a plain grid unless there's a feature AND 2+ reels to flank.
  const isReel = (v) => { const p = parseVideo(v.url); return p.kind === "file" || p.portrait; };
  const reels = videos.filter(isReel);
  const feature = videos.filter((v) => !isReel(v));
  const showcase = feature.length >= 1 && reels.length >= 2;
  const mid = Math.ceil(reels.length / 2);

  return (
    <div className="em">
      <style>{styles}</style>

      {videos.length > 0 && (showcase ? (
        <div className="em-showcase">
          <div className="em-side">{reels.slice(0, mid).map(renderVideo)}</div>
          <div className="em-center">{feature.map(renderVideo)}</div>
          <div className="em-side">{reels.slice(mid).map(renderVideo)}</div>
        </div>
      ) : (
        <div className="em-videos">{videos.map(renderVideo)}</div>
      ))}

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
/* Showcase: reels | feature | reels — feature centred, reels smaller on the sides. */
.em-showcase{display:grid;grid-template-columns:1fr 1.5fr 1fr;gap:18px;align-items:center;}
.em-showcase .em-side{display:grid;grid-template-columns:1fr 1fr;gap:8px;align-content:center;}
.em-showcase .em-center{min-width:0;}
.em-showcase .em-center .em-frame{aspect-ratio:16/9;}
.em-showcase .em-side .em-frame--file,.em-showcase .em-side .em-video--portrait .em-frame{max-width:none;max-height:none;}
.em-showcase .em-side figcaption,.em-showcase .em-side .em-video figcaption{font-size:.68rem;margin-top:.3rem;}
@media (max-width:900px){
  .em-showcase{grid-template-columns:1fr;gap:14px;}
  .em-showcase .em-center{order:-1;}
  .em-showcase .em-center .em-frame{max-width:640px;margin:0 auto;}
}
.em-video{margin:0;}
.em-frame{position:relative;aspect-ratio:16/9;border-radius:8px;overflow:hidden;border:1px solid rgba(201,168,76,.25);background:#000;}
.em-video--portrait .em-frame{aspect-ratio:9/16;max-width:300px;margin:0 auto;}
/* Uploaded (phone) videos: real aspect set inline; cap tall reels, letterbox any odd ones. */
.em-frame--file{aspect-ratio:9/16;max-width:320px;max-height:72vh;margin:0 auto;}
.em-frame iframe,.em-frame video{position:absolute;inset:0;width:100%;height:100%;border:0;object-fit:cover;}
.em-frame--file video{object-fit:contain;}
.em-linkout{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#c9a84c;font-weight:600;text-decoration:none;letter-spacing:.05em;}
.em-video figcaption{font-size:.82rem;color:rgba(255,255,255,.6);margin-top:.5rem;line-height:1.4;}
.em-photos{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(200px,100%),1fr));gap:10px;margin-top:16px;}
.em-photo{display:block;aspect-ratio:4/5;border-radius:6px;overflow:hidden;border:1px solid #1c1c1c;}
.em-photo img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .4s ease;}
.em-photo:hover img{transform:scale(1.05);}
.em-soon{text-align:center;color:rgba(255,255,255,.45);font-style:italic;border:1px dashed rgba(201,168,76,.25);border-radius:8px;padding:2.2rem 1rem;margin:0;}
`;
