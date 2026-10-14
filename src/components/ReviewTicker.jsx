import React, { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

// ============================================================
// DJ VIC — Google reviews ticker. A full-bleed marquee that scrolls
// left → right, fed by the SAME reviews managed in /admin → Reviews.
// Paste your Google reviews into admin and they appear here.
//
// Reads public_reviews() with NO category → every approved review,
// across home + weddings + any you add. Falls back to a seed set so
// the band is never empty. Pauses on hover; honours reduced-motion.
// Self-contained styles (Astro scopes page CSS away from islands).
// ============================================================
const SUPABASE_URL = import.meta.env?.PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env?.PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const FALLBACK = [
  { quote: "VIC made our wedding night truly unforgettable. The transitions were seamless, the energy never dropped, and the audio-visual element left our guests speechless.", author: "Kruthi S.", role: "Wedding, Bangalore", rating: 5 },
  { quote: "We booked VIC for our annual brand event and he read the room perfectly — from the opening set to the close, it was exactly the tone we needed.", author: "Rashmi J.", role: "Corporate Event", rating: 5 },
  { quote: "No one left the dancefloor while Vic was playing! The perfect blend of English and Bollywood for our entire wedding — spot on.", author: "Aryaman", role: "Groom · Bangalore", rating: 5 },
  { quote: "Vic absolutely nailed our wedding! From the cocktail night to the reception, he read the room perfectly and kept everyone dancing all night.", author: "Sarthak", role: "Groom · Kochi", rating: 5 },
  { quote: "Working with Vic on multiple weddings has been seamless every time. Professional, well-prepared, and he genuinely elevates the experience.", author: "Manish Fitkariwala", role: "Wedding Planner · Catapultt", rating: 5 },
  { quote: "We wanted our reception to feel cinematic, not just loud. VIC understood exactly what we meant — the music and visuals together were something else.", author: "Aryaman & Prerna", role: "Wedding Reception", rating: 5 },
];

// Google "G" mark (inline so there's no asset dependency).
function GoogleG({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z" />
      <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z" />
      <path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z" />
      <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z" />
    </svg>
  );
}

export default function ReviewTicker({ googleUrl = "https://www.google.com/maps/search/?api=1&query=DJ+VIC+Bangalore" }) {
  const [items, setItems] = useState(FALLBACK);

  useEffect(() => {
    // No category arg → all approved reviews.
    supabase.rpc("public_reviews")
      .then(({ data }) => {
        if (Array.isArray(data) && data.length) {
          setItems(data.map((t) => ({
            quote: t.quote,
            author: t.author,
            role: t.role || "",
            rating: t.rating || 5,
          })));
        }
      })
      .catch(() => { /* keep fallback on any error */ });
  }, []);

  // Duplicate the list so the marquee loops seamlessly. Speed scales with
  // the number of cards so it always feels the same regardless of count.
  const loop = [...items, ...items];
  const duration = Math.max(28, items.length * 7); // seconds

  return (
    <div className="rtk">
      <style>{styles}</style>

      <div className="rtk-top">
        <span className="rtk-badge">
          <GoogleG size={16} />
          <span className="rtk-stars" aria-hidden="true">★★★★★</span>
          <span className="rtk-badge-label">Reviews on Google</span>
        </span>
        <a className="rtk-cta" href={googleUrl} target="_blank" rel="noopener noreferrer">
          Read all on Google <span aria-hidden="true">→</span>
        </a>
      </div>

      <div className="rtk-mask">
        <div className="rtk-track" style={{ "--rtk-dur": `${duration}s` }}>
          {loop.map((t, i) => (
            <figure className="rtk-card" key={i} aria-hidden={i >= items.length ? "true" : undefined}>
              <div className="rtk-card-head">
                <span className="rtk-card-stars" aria-label={`${t.rating} out of 5`}>
                  {"★".repeat(Math.min(5, Math.max(1, t.rating)))}
                </span>
                <GoogleG size={14} />
              </div>
              <blockquote className="rtk-quote">{t.quote}</blockquote>
              <figcaption className="rtk-attr">
                <strong>{t.author}</strong>
                {t.role && <span>{t.role}</span>}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles = `
.rtk{ --gold:#c9a84c; margin-top:2.25rem; }

.rtk-top{
  display:flex; align-items:center; justify-content:space-between;
  flex-wrap:wrap; gap:.75rem 1rem; margin-bottom:1.5rem;
}
.rtk-badge{ display:inline-flex; align-items:center; gap:.55rem; }
.rtk-badge svg{ display:block; }
.rtk-stars{ color:var(--gold); font-size:.85rem; letter-spacing:2px; }
.rtk-badge-label{
  font-family:'DM Sans',sans-serif; font-size:.8rem; letter-spacing:.04em;
  color:rgba(255,255,255,0.6); text-transform:uppercase;
}
.rtk-cta{
  font-family:'DM Sans',sans-serif; font-size:.82rem; letter-spacing:.03em;
  color:var(--gold); text-decoration:none; white-space:nowrap;
  border-bottom:1px solid rgba(201,168,76,0.35); padding-bottom:1px;
  transition:border-color .25s, opacity .25s;
}
.rtk-cta:hover{ border-color:var(--gold); opacity:.85; }

/* Full-bleed marquee: break out of the max-width container to the viewport. */
.rtk-mask{
  width:100vw; margin-left:calc(50% - 50vw);
  overflow:hidden;
  -webkit-mask-image:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent);
          mask-image:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent);
}
.rtk-track{
  display:flex; gap:1.25rem; width:max-content; padding:.5rem 1.25rem;
  animation:rtk-scroll var(--rtk-dur,40s) linear infinite;
  will-change:transform;
}
/* Scroll LEFT → RIGHT: track slides from -50% back to 0, so cards drift right. */
@keyframes rtk-scroll{
  from{ transform:translateX(-50%); }
  to{   transform:translateX(0); }
}
.rtk-mask:hover .rtk-track{ animation-play-state:paused; }

.rtk-card{
  flex:0 0 340px; width:340px; box-sizing:border-box;
  background:#0e0e0e; border:1px solid #1e1e1e; border-radius:2px;
  padding:1.6rem 1.5rem; margin:0;
  display:flex; flex-direction:column; gap:.9rem;
  transition:border-color .25s, transform .25s;
}
.rtk-card:hover{ border-color:rgba(201,168,76,0.35); transform:translateY(-3px); }
.rtk-card-head{ display:flex; align-items:center; justify-content:space-between; }
.rtk-card-stars{ color:var(--gold); font-size:.8rem; letter-spacing:3px; }
.rtk-quote{
  font-family:'DM Sans',sans-serif; font-size:14px; color:rgba(255,255,255,0.8);
  line-height:1.7; margin:0; flex:1;
  display:-webkit-box; -webkit-line-clamp:5; -webkit-box-orient:vertical; overflow:hidden;
}
.rtk-attr{ border-top:1px solid #1e1e1e; padding-top:.85rem; display:flex; flex-direction:column; gap:.15rem; }
.rtk-attr strong{
  font-family:'Bebas Neue',sans-serif; font-size:.92rem; letter-spacing:.08em;
  text-transform:uppercase; color:#fff;
}
.rtk-attr span{ font-size:.78rem; color:rgba(255,255,255,0.45); }

@media(max-width:600px){
  .rtk-card{ flex-basis:280px; width:280px; padding:1.4rem 1.3rem; }
}

/* Respect reduced-motion: stop the auto-scroll, let people swipe through. */
@media(prefers-reduced-motion:reduce){
  .rtk-mask{ overflow-x:auto; -webkit-overflow-scrolling:touch; }
  .rtk-track{ animation:none; }
}
`;
