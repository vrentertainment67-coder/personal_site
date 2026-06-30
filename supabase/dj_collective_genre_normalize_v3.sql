-- ============================================================
-- v3 — genre normalize for dj_collective_rsvps. SUPERSEDES v1/v2.
-- Two layers, evaluated in order:
--   1) whole-value overrides — exact phrases you flagged map to a set result
--      (e.g. "Mixed Genre Set" -> "Open Format"; multi-tag results allowed).
--   2) otherwise: split on , and /, alias-map each token, drop junk,
--      de-dupe, rejoin ", ". Unknown tokens are title-cased and KEPT.
-- SAFE + idempotent (override outputs that could re-split are self-guarded).
-- Run STEP 1 (preview) first, then STEP 2.
-- ============================================================

create or replace function public.djc_norm_genre(p text)
returns text language sql immutable as $$
  select coalesce(
    -- 1) whole-value overrides (win first). Key = lower, single-spaced.
    (select w.out from (values
        ('versatile','Open Format'),
        ('english','Commercial'),
        ('afro house and dance club','Afro House, Commercial'),
        ('bolly-afro house','Bolly-Afro'),
        ('bollywood and house music','Bollywood, House'),
        ('commercials','Commercial'),
        ('global sounds','Global Sound'),
        ('hip-hop/rnb/old school club classics','Hip-Hop, RNB, Old School, Club Classics'),
        ('hip-hop, rnb, old school, club classics','Hip-Hop, RNB, Old School, Club Classics'),
        ('house music','House'),
        ('mixed genre set','Open Format'),
        ('multi-genre','Open Format'),
        ('multiple','Open Format'),
        ('south','Regional'),
        ('trap 2016','Trap')
     ) w(key, out)
     where w.key = regexp_replace(lower(btrim(p)), '\s+', ' ', 'g')
    ),
    -- 2) split on , and / ; map tokens; drop junk; de-dupe; rejoin.
    (select nullif(string_agg(distinct canon, ', ' order by canon), '')
     from (
       select coalesce(m.canon, initcap(btrim(t.tok))) as canon
       from regexp_split_to_table(p, '\s*[,/]\s*') as t(tok)
       left join (values
          ('bollywood','Bollywood'), ('bolly','Bollywood'),
          ('bolly tech','Bolly Tech'), ('bollytech','Bolly Tech'),
          ('commercial','Commercial'), ('commercials','Commercial'), ('english','Commercial'),
          ('open format','Open Format'), ('openformat','Open Format'),
          ('versatile','Open Format'), ('multiple','Open Format'),
          ('multi-genre','Open Format'), ('mixed genre set','Open Format'),
          ('hip hop','Hip-Hop / R&B'), ('hiphop','Hip-Hop / R&B'), ('hip-hop','Hip-Hop / R&B'),
          ('rnb','Hip-Hop / R&B'), ('r&b','Hip-Hop / R&B'), ('rap','Hip-Hop / R&B'),
          ('house','House'), ('house music','House'),
          ('tech house','Tech House'), ('techhouse','Tech House'),
          ('techno','Techno'),
          ('melodic','Melodic Techno'), ('melodic techno','Melodic Techno'),
          ('afro house','Afro House'), ('afrohouse','Afro House'), ('afro','Afro House'),
          ('deep house','Deep House'), ('deephouse','Deep House'),
          ('progressive','Progressive House'), ('progressive house','Progressive House'),
          ('prog house','Progressive House'), ('prog','Progressive House'),
          ('trance','Trance'),
          ('edm','EDM / Festival'), ('festival','EDM / Festival'),
          ('punjabi','Punjabi'), ('bhangra','Punjabi'),
          ('regional','Regional'), ('south','Regional'),
          ('disco','Disco / Funk'), ('funk','Disco / Funk'),
          ('amapiano','Amapiano'), ('ama piano','Amapiano'),
          ('reggaeton','Reggaeton'),
          ('pop','Pop'),
          ('trap','Trap'),
          ('dnb','Drum & Bass'), ('d&b','Drum & Bass'), ('drum and bass','Drum & Bass'),
          ('drum & bass','Drum & Bass'), ('drum n bass','Drum & Bass')
       ) as m(alias, canon) on m.alias = lower(btrim(t.tok))
       where btrim(t.tok) <> ''
         and lower(btrim(t.tok)) <> all (array['cafe de anotanile','male'])   -- junk, dropped
     ) s
    )
  );
$$;

-- STEP 1 — PREVIEW (no writes): every row that would change, old -> new
select id, genre as old_genre, public.djc_norm_genre(genre) as new_genre
from public.dj_collective_rsvps
where coalesce(btrim(genre), '') <> ''
  and public.djc_norm_genre(genre) is distinct from genre
order by old_genre;

-- ── STEP 2 — APPLY (only after the preview looks right) ──────────────────
update public.dj_collective_rsvps
set genre = public.djc_norm_genre(genre)
where coalesce(btrim(genre), '') <> ''
  and public.djc_norm_genre(genre) is distinct from genre;

-- STEP 3 — final clean tag list (each genre counted once across all picks):
select trim(g) as genre, count(*) as djs
from public.dj_collective_rsvps, regexp_split_to_table(genre, '\s*,\s*') as g
where coalesce(btrim(genre), '') <> ''
group by trim(g)
order by djs desc, genre;

-- STEP 4 — cleanup (optional): drop the helper.
-- drop function public.djc_norm_genre(text);
