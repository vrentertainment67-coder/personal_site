-- ============================================================
-- DJ VIC — seed real Google reviews into the reviews ticker.
-- category = 'google' → shown in the homepage ticker (public_reviews()
-- with no category returns ALL approved), but NOT in the curated
-- homepage grid or weddings grid. Idempotent: re-running won't dupe.
-- RUN ONCE in the Supabase SQL editor. Safe to re-run.
-- ============================================================
insert into public.testimonials (author, role, quote, rating, approved, sort, category)
select * from (values
  ('Rinki Das', '',
   'Big fan! You know the taste of music and the moods of the crowd. I really enjoy and love your playlist. You rock, DJ VIC! ❤️',
   5, true, 1, 'google'),
  ('Guru Prasad', 'Corporate annual day · Sheraton Whitefield',
   'We booked VIC for our company annual day party at Sheraton Whitefield and he nailed the brief exactly. Great energy without ever being over the top, a clean set that matched the tone of the evening, and genuinely easy to coordinate with. Our team is still talking about it — the whole vibe was on another level.',
   5, true, 2, 'google'),
  ('Shivangi', '',
   'One of the best DJs I''ve experienced! Amazing music, great crowd interaction, and flawless execution. Professional, punctual, and highly skilled. The entire event was a huge success thanks to the incredible vibe they created. I would definitely book again and recommend to anyone looking for a top-quality DJ. Highly recommended!',
   5, true, 3, 'google'),
  ('Pooja Lokare', '',
   'Fantastic music selection! The DJ perfectly blended popular Bollywood hits with crowd favourites, ensuring the dance floor remained active and the guests entertained.',
   5, true, 4, 'google')
) as v(author, role, quote, rating, approved, sort, category)
where not exists (
  select 1 from public.testimonials t
  where t.author = v.author and t.quote = v.quote
);
