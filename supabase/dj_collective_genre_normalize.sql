-- ============================================================
-- One-time: normalize OLD free-text genres in dj_collective_rsvps to the
-- preset vocabulary the RSVP form's multi-select now writes.
--
-- SAFE: splits ONLY on commas, so multi-word canonical names that contain
-- "&" / "/" ("Drum & Bass", "Hip-Hop / R&B", "Disco / Funk", "EDM / Festival",
-- "Open Format") survive intact. Known aliases are mapped; anything it doesn't
-- recognise is title-cased and KEPT (never dropped). De-dupes, rejoins ", ".
-- Idempotent — re-running changes nothing.
--
-- HOW TO RUN (Supabase Dashboard -> SQL Editor):
--   1. Run STEP 0 + STEP 1 (read-only) and eyeball the proposed changes.
--   2. If happy, run STEP 2 (the UPDATE).
--   3. STEP 3 cleanup is optional.
-- ============================================================

-- STEP 0 — what's actually stored right now (sanity check):
select genre, count(*) as n
from public.dj_collective_rsvps
where coalesce(btrim(genre), '') <> ''
group by genre
order by n desc;

-- STEP 1a — helper that canonicalises one free-text genre string:
create or replace function public.djc_norm_genre(p text)
returns text language sql immutable as $$
  select nullif(string_agg(distinct canon, ', ' order by canon), '')
  from (
    select coalesce(m.canon, initcap(btrim(t.tok))) as canon
    from regexp_split_to_table(p, '\s*,\s*') as t(tok)
    left join (values
      ('bollywood','Bollywood'), ('bolly','Bollywood'),
      ('commercial','Commercial'),
      ('open format','Open Format'), ('openformat','Open Format'),
      ('hip hop','Hip-Hop / R&B'), ('hiphop','Hip-Hop / R&B'), ('hip-hop','Hip-Hop / R&B'),
      ('hip hop / r&b','Hip-Hop / R&B'), ('hip-hop / r&b','Hip-Hop / R&B'),
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
      ('edm','EDM / Festival'), ('edm / festival','EDM / Festival'), ('festival','EDM / Festival'),
      ('punjabi','Punjabi'), ('bhangra','Punjabi'),
      ('regional','Regional'),
      ('disco','Disco / Funk'), ('funk','Disco / Funk'),
      ('disco / funk','Disco / Funk'), ('disco/funk','Disco / Funk'),
      ('amapiano','Amapiano'), ('ama piano','Amapiano'),
      ('reggaeton','Reggaeton'),
      ('pop','Pop'),
      ('dnb','Drum & Bass'), ('d&b','Drum & Bass'), ('drum and bass','Drum & Bass'),
      ('drum & bass','Drum & Bass'), ('drum n bass','Drum & Bass')
    ) as m(alias, canon) on m.alias = lower(btrim(t.tok))
    where btrim(t.tok) <> ''
  ) s;
$$;

-- STEP 1b — PREVIEW (no writes): only rows that would actually change.
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

-- STEP 3 — cleanup (optional): remove the helper once done.
-- drop function public.djc_norm_genre(text);
