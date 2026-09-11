import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Search } from "lucide-react";

// ── helpers ────────────────────────────────────────────────────────────────
const fmtDate = (iso) => { if (!iso) return ""; const d = new Date(iso + "T12:00:00"); return isNaN(d) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); };
const fmtShort = (iso) => { if (!iso) return ""; const d = new Date(iso + "T12:00:00"); return isNaN(d) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }); };
const thumbMq = (yt) => (yt ? `https://img.youtube.com/vi/${yt}/mqdefault.jpg` : "");
const epCode = (e) => `S${e.s} · E${e.n}`;
const plural = (n) => (n === 1 ? "1 episode" : `${n} episodes`);
const strandColl = (k) => `/thevicfix/collection/strand-${k}/`;
const seasonColl = (s) => `/thevicfix/collection/season-${s}/`;

export default function VicFixListing({ episodes = [], strands = [] }) {
  // `today` decided on the client so a premiere flips to published on time,
  // without waiting for a redeploy.
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const isPublished = useCallback((e) => (!e.date ? true : new Date(e.date + "T00:00:00") <= today), [today]);

  const published = useMemo(() => episodes.filter(isPublished), [episodes, isPublished]);
  const maxSeason = useMemo(() => Math.max(1, ...episodes.map((e) => e.s)), [episodes]);

  // viewsComplete: every PUBLISHED episode has a real view count. While false,
  // all view numbers + the "Most watched" sort/badge stay hidden.
  const viewsComplete = useMemo(() => published.length > 0 && published.every((e) => e.pop > 0), [published]);

  // strand counts over the whole catalogue, ordered by count desc.
  const strandsWithCounts = useMemo(
    () => strands.map((s) => ({ ...s, count: episodes.filter((e) => e.cat === s.key).length })).filter((s) => s.count > 0).sort((a, b) => b.count - a.count),
    [episodes, strands]
  );

  const topSlugs = useMemo(() => {
    if (!viewsComplete) return new Set();
    return new Set([...published].sort((a, b) => b.pop - a.pop).slice(0, 6).map((e) => e.slug));
  }, [viewsComplete, published]);

  // ── filter state ──────────────────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [dq, setDq] = useState("");            // debounced
  const [season, setSeason] = useState("all"); // 'all' | '1' | '2'
  const [strand, setStrand] = useState("all"); // 'all' | key
  const [sort, setSort] = useState("latest");  // 'latest' | 'oldest' | 'popular'
  const [ready, setReady] = useState(false);
  const listRef = useRef(null);

  // restore from the query string on load
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const s = p.get("season"); if (s === "1" || s === "2") setSeason(s);
    const st = p.get("strand"); if (st && strands.some((x) => x.key === st)) setStrand(st);
    const so = p.get("sort"); if (so === "oldest" || so === "popular" || so === "latest") setSort(so);
    const q = p.get("q"); if (q) { setQuery(q); setDq(q); }
    setReady(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { const t = setTimeout(() => setDq(query), 150); return () => clearTimeout(t); }, [query]);
  useEffect(() => { if (sort === "popular" && !viewsComplete) setSort("latest"); }, [sort, viewsComplete]);

  // write state → query string
  useEffect(() => {
    if (!ready) return;
    const p = new URLSearchParams();
    if (season !== "all") p.set("season", season);
    if (strand !== "all") p.set("strand", strand);
    if (sort !== "latest") p.set("sort", sort);
    if (dq) p.set("q", dq);
    const qs = p.toString();
    window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash);
  }, [season, strand, sort, dq, ready]);

  const filtered = useMemo(() => {
    const q = dq.trim().toLowerCase();
    return episodes.filter((e) => {
      if (season !== "all" && String(e.s) !== season) return false;
      if (strand !== "all" && e.cat !== strand) return false;
      if (q) {
        const hay = [e.name, e.role, e.catLabel, e.hook, ...(e.topics || [])].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [episodes, season, strand, dq]);

  const hasFilters = season !== "all" || strand !== "all" || dq.trim() !== "";
  const isEmpty = filtered.length === 0;

  const groups = useMemo(() => {
    const list = [...filtered];
    if (sort === "oldest") {
      list.sort((a, b) => (a.s !== b.s ? a.s - b.s : a.n - b.n));
      return [{ key: "begin", label: "From the beginning", meta: `${plural(list.length)} · S1 · E1 onward`, eps: list }];
    }
    if (sort === "popular") {
      list.sort((a, b) => b.pop - a.pop);
      return [{ key: "top", label: "Most watched", meta: plural(list.length), eps: list }];
    }
    list.sort((a, b) => (a.s !== b.s ? b.s - a.s : b.n - a.n));
    const bySeason = {};
    list.forEach((e) => (bySeason[e.s] = bySeason[e.s] || []).push(e));
    return Object.keys(bySeason).map(Number).sort((a, b) => b - a).map((s) => ({
      key: `s${s}`,
      label: `Season ${s}`,
      meta: `${plural(bySeason[s].length)} · ${s === maxSeason ? "current chapter" : "where it started"}`,
      eps: bySeason[s],
    }));
  }, [filtered, sort, maxSeason]);

  const countLabel = !ready ? "Loading…" : hasFilters ? `${filtered.length} of ${episodes.length}` : plural(episodes.length);

  // ── handlers ────────────────────────────────────────────────────────────
  const pickStrandTile = (k, e) => {
    if (e) e.preventDefault();
    const next = strand === k ? "all" : k;
    setStrand(next); setSeason("all"); setQuery(""); setDq("");
    setTimeout(() => listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };
  const setStrandChip = (k, e) => { if (e) e.preventDefault(); setStrand(k); };
  const setSeasonChip = (s, e) => { if (e) e.preventDefault(); setSeason(s); };
  const clearAll = () => { setQuery(""); setDq(""); setSeason("all"); setStrand("all"); };

  const sortOptions = [
    { key: "latest", label: "Latest first" },
    { key: "oldest", label: "Oldest first" },
    ...(viewsComplete ? [{ key: "popular", label: "Most watched" }] : []),
  ];

  return (
    <div className="vfx">
      {/* ── 3 · Strand guide ─────────────────────────────────────────── */}
      <section className="vfx-block vfx-strands-sec" ref={listRef} aria-label="Browse by strand">
        <div className="vfx-inner">
          <div className="vfx-head">
            <span className="vfx-rule" />
            <span className="vfx-eyebrow">Six strands</span>
            <h2 className="vfx-h2">Browse by who&apos;s in the chair</h2>
          </div>
          <div className="vfx-strand-grid">
            {strandsWithCounts.map((s) => (
              <a
                key={s.key}
                href={strandColl(s.key)}
                className={`vfx-strand-tile${strand === s.key ? " on" : ""}`}
                onClick={(e) => pickStrandTile(s.key, e)}
                aria-pressed={strand === s.key}
              >
                <span className="vfx-strand-label">{s.label}</span>
                <span className="vfx-strand-desc">{s.desc}</span>
                <span className="vfx-strand-count">{plural(s.count)}</span>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ── 4 · Sticky browse toolbar ────────────────────────────────── */}
      <div className="vfx-toolbar">
        <div className="vfx-inner">
          <div className="vfx-tb-row1">
            <div className="vfx-search">
              <Search size={15} className="vfx-search-ic" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search guests, venues, topics…"
                aria-label="Search episodes"
              />
            </div>

            <div className="vfx-seg" role="group" aria-label="Season">
              <button type="button" className={`vfx-chip${season === "all" ? " on" : ""}`} onClick={() => setSeason("all")}>All</button>
              <a href={seasonColl(2)} className={`vfx-chip${season === "2" ? " on" : ""}`} onClick={(e) => setSeasonChip("2", e)}>Season 2</a>
              <a href={seasonColl(1)} className={`vfx-chip${season === "1" ? " on" : ""}`} onClick={(e) => setSeasonChip("1", e)}>Season 1</a>
            </div>

            <div className="vfx-seg" role="group" aria-label="Sort">
              <span className="vfx-seg-label">Sort</span>
              {sortOptions.map((o) => (
                <button key={o.key} type="button" className={`vfx-chip${sort === o.key ? " on" : ""}`} onClick={() => setSort(o.key)}>{o.label}</button>
              ))}
            </div>

            <div className="vfx-tb-right">
              <span className="vfx-count">{countLabel}</span>
              {hasFilters && <button type="button" className="vfx-clear" onClick={clearAll}>Clear</button>}
            </div>
          </div>

          <div className="vfx-tb-row2">
            <button type="button" className={`vfx-chip${strand === "all" ? " on" : ""}`} onClick={() => setStrand("all")}>All strands</button>
            {strandsWithCounts.map((s) => (
              <a key={s.key} href={strandColl(s.key)} className={`vfx-chip${strand === s.key ? " on" : ""}`} onClick={(e) => setStrandChip(s.key, e)}>
                {s.label} · {s.count}
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* ── 5 · Episode list ─────────────────────────────────────────── */}
      <section className="vfx-block vfx-list-sec" aria-label="Episodes">
        <div className="vfx-inner">
          {isEmpty ? (
            <div className="vfx-empty">
              <h3 className="vfx-empty-h">Nothing matches that</h3>
              <p className="vfx-empty-p">Try a different strand, or clear the filters to see all {episodes.length} episodes.</p>
              <button type="button" className="vfx-btn-gold" onClick={clearAll}>Clear filters</button>
            </div>
          ) : (
            groups.map((g) => (
              <div className="vfx-season" key={g.key}>
                <div className="vfx-season-head">
                  <span className="vfx-season-label">{g.label}</span>
                  <span className="vfx-season-meta">{g.meta}</span>
                </div>
                <div className="vfx-rows">
                  {g.eps.map((e) => {
                    const upcoming = !isPublished(e);
                    const featured = e.featured && !upcoming;
                    const mostWatched = topSlugs.has(e.slug);
                    const tb = thumbMq(e.yt);
                    return (
                      <a className="vfx-row" href={e.slug} key={e.slug}>
                        <div className="vfx-thumb">
                          {tb ? <img src={tb} alt="" loading="lazy" width="150" height="84" /> : <span className="vfx-thumb-fallback" aria-hidden="true" />}
                          <span className="vfx-code">{epCode(e)}</span>
                        </div>
                        <div className="vfx-rowtext">
                          <span className="vfx-strandlab">{e.catLabel}</span>
                          <span className="vfx-namerow">
                            <span className="vfx-name">{e.name}</span>
                            {upcoming && <span className="vfx-badge-solid">Premieres soon</span>}
                            {featured && <span className="vfx-badge-out">Featured</span>}
                            {mostWatched && <span className="vfx-badge-out">Most watched</span>}
                          </span>
                          <span className="vfx-role">{e.role}</span>
                          {e.hook && <span className="vfx-hook">{e.hook}</span>}
                          <span className="vfx-meta">
                            <span className="vfx-date">{upcoming ? `Premieres ${fmtShort(e.date)}` : fmtDate(e.date)}</span>
                            {e.duration && <span className="vfx-dur">{e.duration}</span>}
                            {viewsComplete && e.pop > 0 && <span className="vfx-views">{e.pop.toLocaleString()} views</span>}
                            <span className="vfx-read">Read &rarr;</span>
                          </span>
                        </div>
                      </a>
                    );
                  })}
                </div>
              </div>
            ))
          )}

          <p className="vfx-coll-note">
            Every season and strand view above also exists as its own page{" "}
            &mdash; <a href="/thevicfix/archive/">the full archive</a>{" "}
            and <a href={strandColl("behind-the-decks")}>strand pages</a>{" "}
            &mdash; so filtered views stay shareable and indexable.
          </p>
        </div>
      </section>

      <style>{`
        .vfx { --line: #1a1a1a; --line2: #1e1e1e; --line3: #242424; --gold-a: rgba(201,168,76,.4); }
        .vfx * { box-sizing: border-box; }
        .vfx-inner { max-width: 1180px; margin: 0 auto; padding-left: 28px; padding-right: 28px; }
        .vfx-block { padding-top: 48px; padding-bottom: 52px; }
        .vfx-strands-sec { border-top: 1px solid #141414; background: rgba(0,0,0,.28); }

        /* section header pattern */
        .vfx-head { margin-bottom: 26px; }
        .vfx-rule { display: block; width: 40px; height: 2px; background: var(--gold); margin-bottom: 16px; }
        .vfx-eyebrow { display: block; font-family: 'DM Sans', sans-serif; font-size: 11px; font-weight: 500; letter-spacing: .22em; text-transform: uppercase; color: var(--gold); margin-bottom: 10px; }
        .vfx-h2 { font-family: 'Bebas Neue', sans-serif; font-weight: 400; font-size: clamp(28px, 4vw, 40px); letter-spacing: .04em; line-height: 1; color: #fff; margin: 0; }

        /* strand tiles */
        .vfx-strand-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 1px; background: rgba(201,168,76,.16); border: 1px solid rgba(201,168,76,.16); }
        .vfx-strand-tile { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; text-align: left; text-decoration: none; padding: 20px 20px 22px; background: #0b0b0b; transition: background .2s; cursor: pointer; }
        .vfx-strand-tile:hover { background: #111; }
        .vfx-strand-tile.on { background: #16130c; }
        .vfx-strand-label { font-family: 'Bebas Neue', sans-serif; font-size: 21px; letter-spacing: .03em; color: #fff; }
        .vfx-strand-desc { font-family: 'Space Grotesk', sans-serif; font-size: 12.5px; line-height: 1.5; color: rgba(255,255,255,.55); }
        .vfx-strand-count { font-family: 'DM Mono', monospace; font-size: 11px; color: var(--gold); margin-top: 4px; }

        /* toolbar */
        .vfx-toolbar { position: sticky; top: var(--vfx-nav-h, 82px); z-index: 30; background: rgba(6,6,6,.97); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); border-top: 1px solid #141414; border-bottom: 1px solid var(--line2); }
        .vfx-tb-row1 { display: flex; gap: 16px; flex-wrap: wrap; align-items: center; padding: 14px 28px; }
        .vfx-tb-row2 { display: flex; gap: 6px; flex-wrap: wrap; padding: 0 28px 14px; }
        .vfx-tb-row1, .vfx-tb-row2 { max-width: 1180px; margin: 0 auto; }
        .vfx-search { position: relative; flex: 1 1 230px; min-width: 190px; display: flex; align-items: center; }
        .vfx-search-ic { position: absolute; left: 12px; color: var(--gold); pointer-events: none; }
        .vfx-search input { width: 100%; background: #0d0d0d; border: 1px solid var(--line3); border-radius: 2px; color: #fff; font-family: 'Space Grotesk', sans-serif; font-size: 13.5px; padding: 11px 14px 11px 34px; outline: none; transition: border-color .2s; }
        .vfx-search input:focus { border-color: var(--gold); }
        .vfx-search input::placeholder { color: rgba(255,255,255,.4); }
        .vfx-seg { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .vfx-seg-label { font-family: 'DM Sans', sans-serif; font-size: 11px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: rgba(255,255,255,.42); margin-right: 2px; }

        .vfx-chip { display: inline-block; background: transparent; border: 1px solid var(--line3); color: rgba(255,255,255,.55); font-family: 'DM Sans', sans-serif; font-weight: 600; font-size: 11px; line-height: 1; letter-spacing: .14em; text-transform: uppercase; text-decoration: none; padding: 8px 13px; border-radius: 2px; white-space: nowrap; cursor: pointer; transition: border-color .2s, color .2s, background .2s; }
        .vfx-chip:hover { color: var(--gold); border-color: var(--gold-a); }
        .vfx-chip.on { background: var(--gold); border-color: var(--gold); color: #050a08; }

        .vfx-tb-right { display: flex; align-items: center; gap: 12px; margin-left: auto; }
        .vfx-count { font-family: 'DM Mono', monospace; font-size: 11.5px; color: rgba(255,255,255,.5); white-space: nowrap; }
        .vfx-clear { background: none; border: none; color: rgba(201,168,76,.85); font-family: 'DM Sans', sans-serif; font-size: 11px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; cursor: pointer; padding: 4px; }
        .vfx-clear:hover { color: var(--gold-light); }

        /* season groups */
        .vfx-season { margin-bottom: 26px; }
        .vfx-season-head { position: sticky; top: calc(var(--vfx-nav-h, 82px) + 96px); z-index: 20; background: rgba(6,6,6,.96); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); padding: 22px 4px 12px; border-bottom: 1px solid rgba(201,168,76,.2); display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; }
        .vfx-season-label { font-family: 'Bebas Neue', sans-serif; font-size: 26px; letter-spacing: .07em; color: #fff; }
        .vfx-season-meta { font-family: 'DM Mono', monospace; font-size: 11px; color: rgba(255,255,255,.4); }

        /* rows */
        .vfx-rows { display: grid; gap: 1px; background: var(--line); border: 1px solid var(--line); border-top: none; }
        .vfx-row { display: flex; gap: 16px; align-items: flex-start; background: #0d0d0d; padding: 14px; text-decoration: none; transition: background .2s; }
        .vfx-row:hover { background: #151515; }
        .vfx-thumb { position: relative; flex: 0 0 clamp(104px, 21vw, 150px); aspect-ratio: 16 / 9; overflow: hidden; background: #111; }
        .vfx-thumb img { width: 100%; height: 100%; object-fit: cover; filter: brightness(.88); display: block; }
        .vfx-thumb-fallback { position: absolute; inset: 0; background: radial-gradient(120% 130% at 78% 18%, #1a160c, transparent 55%), linear-gradient(150deg, #0e0e0e, #16130c); }
        .vfx-code { position: absolute; bottom: 0; left: 0; background: var(--gold); color: #050a08; font-family: 'DM Sans', sans-serif; font-size: 10.5px; font-weight: 700; letter-spacing: .14em; padding: 3px 7px; }

        .vfx-rowtext { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
        .vfx-strandlab { font-family: 'DM Sans', sans-serif; font-size: 10.5px; font-weight: 500; letter-spacing: .2em; text-transform: uppercase; color: rgba(255,255,255,.42); }
        .vfx-namerow { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
        .vfx-name { font-family: 'Space Grotesk', sans-serif; font-size: 17px; font-weight: 500; line-height: 1.25; color: #fff; }
        .vfx-role { font-size: 12.5px; color: var(--gold); }
        .vfx-hook { font-family: 'Space Grotesk', sans-serif; font-size: 13px; line-height: 1.6; color: rgba(255,255,255,.58); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .vfx-meta { display: flex; gap: 14px; flex-wrap: wrap; align-items: center; margin-top: 6px; }
        .vfx-date, .vfx-dur { font-family: 'DM Mono', monospace; font-size: 11px; color: rgba(255,255,255,.38); }
        .vfx-views { font-family: 'DM Mono', monospace; font-size: 11px; color: rgba(201,168,76,.75); }
        .vfx-read { margin-left: auto; font-family: 'DM Sans', sans-serif; font-size: 10.5px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: rgba(201,168,76,.8); }
        .vfx-row:hover .vfx-read { color: var(--gold-light); }

        /* badges */
        .vfx-badge-out { font-family: 'DM Sans', sans-serif; font-size: 10px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--gold); border: 1px solid var(--gold-a); border-radius: 2px; padding: 2px 6px; }
        .vfx-badge-solid { font-family: 'DM Sans', sans-serif; font-size: 10px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: #050a08; background: var(--gold); border-radius: 2px; padding: 2px 6px; }

        /* empty state */
        .vfx-empty { text-align: center; padding: 80px 20px; background: #0b0b0b; border: 1px solid var(--line); }
        .vfx-empty-h { font-family: 'Bebas Neue', sans-serif; font-weight: 400; font-size: 28px; letter-spacing: .04em; color: #fff; margin: 0 0 10px; }
        .vfx-empty-p { font-family: 'Space Grotesk', sans-serif; font-size: 14px; color: rgba(255,255,255,.55); margin: 0 0 22px; }
        .vfx-btn-gold { display: inline-block; background: var(--gold); color: #050a08; border: none; font-family: 'DM Sans', sans-serif; font-size: 12px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; padding: 11px 20px; border-radius: 2px; cursor: pointer; text-decoration: none; transition: background .2s; }
        .vfx-btn-gold:hover { background: var(--gold-light); }

        .vfx-coll-note { margin-top: 26px; font-family: 'Space Grotesk', sans-serif; font-size: 12.5px; line-height: 1.7; color: rgba(255,255,255,.34); }
        .vfx-coll-note a { color: rgba(201,168,76,.75); text-decoration: none; }
        .vfx-coll-note a:hover { color: var(--gold-light); }

        @media (max-width: 768px) {
          .vfx { --vfx-nav-h: 68px; }
          .vfx-inner, .vfx-tb-row1, .vfx-tb-row2 { padding-left: 16px; padding-right: 16px; }
          .vfx-tb-right { margin-left: 0; width: 100%; }
        }
      `}</style>
    </div>
  );
}
