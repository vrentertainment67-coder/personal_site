-- ============================================================
-- DJ VIC — testimonials: enable admin management + seed the live reviews
-- Seeds the 3 reviews currently shown on the homepage into the testimonials
-- table so they appear (and become editable) in the admin Reviews tab.
-- RUN ONCE in the Supabase SQL editor. Safe to re-run (only seeds if empty).
-- ============================================================

-- Admin (authenticated) can read + manage testimonials. Public reads happen via
-- the public_testimonials() RPC, so anon needs no direct table access.
grant select, insert, update, delete on public.testimonials to authenticated;
alter table public.testimonials enable row level security;
drop policy if exists "admin manage testimonials" on public.testimonials;
create policy "admin manage testimonials"
  on public.testimonials for all to authenticated using (true) with check (true);

-- Seed the current homepage reviews (only if the table is still empty).
insert into public.testimonials (author, role, quote, rating, approved, sort)
select * from (values
  ('Kruthi S.', 'Wedding, Bangalore', 'VIC made our wedding night truly unforgettable. The transitions were seamless, the energy never dropped, and the audio-visual element left our guests speechless.', 5, true, 1),
  ('Rashmi J.', 'Corporate Event', 'We booked VIC for our annual brand event and he read the room perfectly — from the opening set to the close, it was exactly the tone we needed.', 5, true, 2),
  ('Aryaman & Prerna', 'Wedding Reception', 'We wanted our reception to feel cinematic, not just loud. VIC understood exactly what we meant — the music and visuals together were something else.', 5, true, 3)
) as v(author, role, quote, rating, approved, sort)
where not exists (select 1 from public.testimonials);
