-- ============================================================
-- v2 — comprehensive genre normalize for dj_collective_rsvps.
-- Splits on BOTH commas AND slashes, so "commercial/house" -> two tags.
-- Slash-containing canonical names survive because their PARTS are aliased
-- and re-dedupe (e.g. "Disco / Funk" -> disco,funk -> both map back to
-- "Disco / Funk" -> one tag). Known aliases -> canonical; unknown tokens are
-- title-cased and KEPT; a small junk list is dropped. De-dupes, rejoins ", ".
-- SAFE + idempotent. Run STEP 1 (preview) first, then STEP 2.
-- ============================================================

-- STEP 1a — (re)create the canonicaliser, now splitting on , and /
create or replace function public.djc_norm_genre(p text)
returns text language sql immutable as $$
  select nullif(string_agg(distinct canon, ', ' order by canon), '')
  from (
    select coalesce(m.canon, initcap(btrim(t.tok))) as canon
    from regexp_split_to_table(p, '\s*[,/]\s*') as t(tok)
    left join (values
      ('bollywood','Bollywood'), ('bolly','Bollywood'),
      ('bolly tech','Bolly Tech'), ('bollytech','Bolly Tech'),
      ('commercial','Commercial'),
      ('open format','Open Format'), ('openformat','Open Format'),
      ('hip hop','Hip-Hop / R&B'), ('hiphop','Hip-Hop / R&B'), ('hip-hop','Hip-Hop / R&B'),
      ('rnb','Hip-Hop / R&B'), ('r&b','Hip-Hop / R&B'), ('rap','Hip-Hop / R&B'),
      ('house','House'),
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
      ('regional','Regional'),
      ('disco','Disco / Funk'), ('funk','Disco / Funk'),
      ('amapiano','Amapiano'), ('ama piano','Amapiano'),
      ('reggaeton','Reggaeton'),
      ('pop','Pop'),
      ('dnb','Drum & Bass'), ('d&b','Drum & Bass'), ('drum and bass','Drum & Bass'),
      ('drum & bass','Drum & Bass'), ('drum n bass','Drum & Bass')
    ) as m(alias, canon) on m.alias = lower(btrim(t.tok))
    where btrim(t.tok) <> ''
      and lower(btrim(t.tok)) <> all (array['cafe de anotanile'])   -- junk, dropped
  ) s;
$$;

-- STEP 1b — PREVIEW (no writes): every row that would change, old -> new
select id, genre as old_genre, public.djc_norm_genre(genre) as new_genre
from public.dj_collective_rsvps
where coalesce(btrim(genre), '') <> ''
  and public.djc_norm_genre(genre) is distinct from genre
order by old_genre;

-- ── STEP 2 — APPLY (run only after the preview looks right) ──────────────
update public.dj_collective_rsvps
set genre = public.djc_norm_genre(genre)
where coalesce(btrim(genre), '') <> ''
  and public.djc_norm_genre(genre) is distinct from genre;

-- STEP 3 — the clean, de-duped tag list afterwards (each genre counted once):
select trim(g) as genre, count(*) as djs
from public.dj_collective_rsvps, regexp_split_to_table(genre, '\s*,\s*') as g
where coalesce(btrim(genre), '') <> ''
group by trim(g)
order by djs desc, genre;

-- STEP 4 — cleanup (optional): drop the helper.
-- drop function public.djc_norm_genre(text);
