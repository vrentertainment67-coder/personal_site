-- ── Manual genre fixes: space-separated old entries the safe (comma-only)
--    normalize script intentionally left untouched. Run in the SQL editor.
--    Whitespace-insensitive match, so it works whatever the current casing is.

-- "bolly tech commercial afro"  ->  three genres
update public.dj_collective_rsvps
set genre = 'Bolly Tech, Commercial, Afro'
where regexp_replace(lower(btrim(genre)), '\s+', ' ', 'g') = 'bolly tech commercial afro';

-- "cafe de anotanile" is not a genre -> clear it (exact whole-value match,
-- whitespace/case-insensitive, so it won't touch combined entries).
update public.dj_collective_rsvps
set genre = null
where regexp_replace(lower(btrim(genre)), '\s+', ' ', 'g') = 'cafe de anotanile';

-- "commercial/house" (slash) -> two genres selected
update public.dj_collective_rsvps
set genre = 'Commercial, House'
where regexp_replace(lower(btrim(genre)), '\s*/\s*', '/', 'g') = 'commercial/house';

-- Verify the results:
select id, genre from public.dj_collective_rsvps
where genre ilike '%bolly%' or genre ilike '%afro%' or genre ilike '%commercial%'
   or genre ilike '%house%' or genre ilike '%cafe%'
order by genre;

-- If the "cafe de" row didn't clear (its real spelling differs from what we
-- matched), find the exact value with:  select id, genre from
-- public.dj_collective_rsvps where genre ilike '%cafe%';  -- then tell me.
