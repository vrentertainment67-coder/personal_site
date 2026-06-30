-- ── Manual genre fixes: space-separated old entries the safe (comma-only)
--    normalize script intentionally left untouched. Run in the SQL editor.
--    Whitespace-insensitive match, so it works whatever the current casing is.

-- "bolly tech commercial afro"  ->  three genres
update public.dj_collective_rsvps
set genre = 'Bolly Tech, Commercial, Afro'
where regexp_replace(lower(btrim(genre)), '\s+', ' ', 'g') = 'bolly tech commercial afro';

-- Verify the result:
select id, genre from public.dj_collective_rsvps
where genre ilike '%bolly%' or genre ilike '%afro%' or genre ilike '%commercial%'
order by genre;
