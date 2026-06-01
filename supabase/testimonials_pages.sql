-- ============================================================
-- DJ VIC — testimonials by page/category (supersedes testimonials_seed.sql)
-- Adds a `category` so reviews can be scoped per page (home vs weddings),
-- seeds both the homepage and weddings reviews, and exposes a category-aware
-- public RPC. RUN ONCE in the Supabase SQL editor. Safe to re-run.
-- ============================================================

-- 1) Admin can read/manage; public reads via the RPC below.
grant select, insert, update, delete on public.testimonials to authenticated;
alter table public.testimonials enable row level security;
drop policy if exists "admin manage testimonials" on public.testimonials;
create policy "admin manage testimonials"
  on public.testimonials for all to authenticated using (true) with check (true);

-- 2) Category column (existing rows default to 'home').
alter table public.testimonials add column if not exists category text not null default 'home';

-- 3) Seed homepage reviews (only if none exist for that category).
insert into public.testimonials (author, role, quote, rating, approved, sort, category)
select * from (values
  ('Kruthi S.', 'Wedding, Bangalore', 'VIC made our wedding night truly unforgettable. The transitions were seamless, the energy never dropped, and the audio-visual element left our guests speechless.', 5, true, 1, 'home'),
  ('Rashmi J.', 'Corporate Event', 'We booked VIC for our annual brand event and he read the room perfectly — from the opening set to the close, it was exactly the tone we needed.', 5, true, 2, 'home'),
  ('Aryaman & Prerna', 'Wedding Reception', 'We wanted our reception to feel cinematic, not just loud. VIC understood exactly what we meant — the music and visuals together were something else.', 5, true, 3, 'home')
) as v(author, role, quote, rating, approved, sort, category)
where not exists (select 1 from public.testimonials where category = 'home');

-- 4) Seed weddings-page reviews (only if none exist for that category).
insert into public.testimonials (author, role, quote, rating, approved, sort, category)
select * from (values
  ('Sarthak', 'Groom · Dec 2024 · Kochi', 'Vic absolutely nailed our wedding! From the cocktail night to the reception, he read the room perfectly and kept everyone on the dancefloor all night. Couldn''t have asked for better energy.', 5, true, 1, 'wedding'),
  ('Rashmi Jaiswal', 'Bride · Jan 2025 · Bangalore', 'VIC played for my special day recently, and rocked our cocktail night! Being a North-South wedding, he chose the perfect energetic tunes to keep our guests going on the floor!', 5, true, 2, 'wedding'),
  ('Aryaman', 'Groom · July 2025 · Bangalore', 'I think no one left the dancefloor while Vic was playing! He executed the perfect blend of English and Bollywood songs for my entire wedding functions and it was spot on!', 5, true, 3, 'wedding'),
  ('Kruthi Singar', 'Bride · Dec 2023 · Bangalore', 'VIC was recommended by my cousin and livened up our wedding parties with his music selection and engaging performances. A special mention on the live baraat with dhol performance!!', 5, true, 4, 'wedding'),
  ('Manish Fitkariwala', 'Wedding Planner · Catapultt', 'Working with Vic on multiple weddings has been seamless every time. He''s professional, well-prepared, and genuinely elevates the experience. Highly recommended for any event.', 5, true, 5, 'wedding')
) as v(author, role, quote, rating, approved, sort, category)
where not exists (select 1 from public.testimonials where category = 'wedding');

-- 5) Category-aware public RPC (approved reviews; all if no category given).
create or replace function public.public_reviews(p_category text default null)
returns setof public.testimonials
language sql security definer set search_path = public stable
as $$
  select * from public.testimonials
  where approved = true and (p_category is null or category = p_category)
  order by sort, created_at desc;
$$;
grant execute on function public.public_reviews(text) to anon, authenticated;
