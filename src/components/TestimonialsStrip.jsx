import React, { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

// ============================================================
// DJ VIC — homepage testimonials (managed from /admin → Reviews).
// Reads public_testimonials(); falls back to the original hardcoded
// quotes when the table is empty, so the section is never blank.
// Self-contained styles because Astro scopes page CSS away from React.
// ============================================================
const SUPABASE_URL = import.meta.env?.PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env?.PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const FALLBACK = [
  { quote: "VIC made our wedding night truly unforgettable. The transitions were seamless, the energy never dropped, and the audio-visual element left our guests speechless.", name: "Kruthi S.", event: "Wedding, Bangalore", rating: 5 },
  { quote: "We booked VIC for our annual brand event and he read the room perfectly — from the opening set to the close, it was exactly the tone we needed.", name: "Rashmi J.", event: "Corporate Event", rating: 5 },
  { quote: "We wanted our reception to feel cinematic, not just loud. VIC understood exactly what we meant — the music and visuals together were something else.", name: "Aryaman & Prerna", event: "Wedding Reception", rating: 5 },
];

export default function TestimonialsStrip({ category = "home", fallback }) {
  const fb = Array.isArray(fallback) && fallback.length ? fallback : FALLBACK;
  const [items, setItems] = useState(fb);

  useEffect(() => {
    supabase.rpc("public_reviews", { p_category: category })
      .then(({ data }) => {
        if (Array.isArray(data) && data.length) {
          setItems(data.map((t) => ({
            quote: t.quote,
            name: t.author,
            event: t.role || "",
            rating: t.rating || 0,
          })));
        }
      })
      .catch(() => { /* keep fallback on any error */ });
  }, []); // eslint-disable-line

  return (
    <div className="rt-grid">
      <style>{rtStyles}</style>
      {items.map((t, i) => (
        <div className="rt-card" key={i}>
          <div className="rt-mark">&ldquo;</div>
          {t.rating > 0 && (
            <div className="rt-stars" aria-label={`${t.rating} out of 5`}>
              {"★".repeat(Math.min(5, Math.max(1, t.rating)))}
            </div>
          )}
          <p className="rt-text">{t.quote}</p>
          <div className="rt-attr">
            <strong>{t.name}</strong>
            {t.event && <span>{t.event}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

const rtStyles = `
.rt-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1.5rem;margin-top:2.5rem;}
.rt-card{background:#0e0e0e;border:1px solid #1e1e1e;padding:2rem 1.75rem;display:flex;flex-direction:column;gap:1rem;transition:border-color .25s;}
.rt-card:hover{border-color:rgba(201,168,76,0.3);}
.rt-mark{font-family:Georgia,serif;font-size:3.5rem;line-height:.7;color:#c9a84c;opacity:.4;}
.rt-stars{color:#c9a84c;font-size:.8rem;letter-spacing:3px;}
.rt-text{font-family:'DM Sans',sans-serif;font-size:.9rem;font-style:italic;color:rgba(255,255,255,0.72);line-height:1.75;margin:0;flex:1;}
.rt-attr{border-top:1px solid #1e1e1e;padding-top:1rem;display:flex;flex-direction:column;gap:.2rem;}
.rt-attr strong{font-family:'Bebas Neue',sans-serif;font-size:.95rem;letter-spacing:.08em;text-transform:uppercase;color:#fff;}
.rt-attr span{font-size:.8rem;color:rgba(255,255,255,0.45);}
@media(max-width:760px){.rt-grid{grid-template-columns:1fr;}}
`;
