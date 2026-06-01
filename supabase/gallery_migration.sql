-- ============================================================
-- DJ VIC — Gallery migration
-- Makes the `media` table the single source of truth for /photos so the
-- admin Gallery tab is a true live mirror. RUN ONCE in the Supabase SQL editor.
-- Safe to re-run: it clears prior curated rows and re-seeds them.
-- ============================================================

-- 1) Public (anon) can read gallery media, so the live site mirrors the table.
drop policy if exists "public read gallery media" on public.media;
create policy "public read gallery media"
  on public.media for select to anon
  using (kind = 'gallery');

-- 2) Seed the 36 curated photos so they're fully manageable from the admin.
--    public_id 'curated/NN' marks them; deleting one from the admin just removes
--    the row (the /images/rf file stays in the repo, harmless).
delete from public.media where public_id like 'curated/%';

insert into public.media (url, kind, public_id, sort, caption) values
  ('/images/rf/07c0f6eab1701c1d508901023512a096.jpg','gallery','curated/01',1,'DJ VIC performing at a club night in Bangalore'),
  ('/images/rf/298c07a92d4903cbabd91c0b2a16abd6.jpg','gallery','curated/02',2,'DJ VIC behind the Pioneer CDJ decks at a live event'),
  ('/images/rf/395173e132071fd9ba0a5358c0fcd303.jpg','gallery','curated/03',3,'DJ VIC on stage at a wedding reception in Bangalore'),
  ('/images/rf/5bfd516625730ff7f8fc3183473e2be2.jpg','gallery','curated/04',4,'DJ VIC performing at a premium nightclub event'),
  ('/images/rf/8cf00a645bcc4ebe2a282ecaa8ec0ad6.jpg','gallery','curated/05',5,'DJ VIC performing an audio-visual set at a corporate event'),
  ('/images/rf/9cb31e23751f9a8e7f25f32ea3f0e089.jpg','gallery','curated/06',6,'DJ VIC with stage lighting at a high-energy club night'),
  ('/images/rf/22abc12a9a9074841eafc24eae21128f.jpg','gallery','curated/07',7,'DJ VIC at a rooftop bar event in Bangalore'),
  ('/images/rf/0db7b40ce5a1d0021f56fb8f6484f71f.jpg','gallery','curated/08',8,'DJ VIC performing at a sangeet night with colourful lighting'),
  ('/images/rf/a287f96d3f2b80c7288439de3d1ceedf.jpg','gallery','curated/09',9,'DJ VIC behind the decks at a five-star hotel event'),
  ('/images/rf/829ffc472525d115862441b5e012bef0.jpg','gallery','curated/10',10,'DJ VIC at a festival stage performance in India'),
  ('/images/rf/bc00edb8969117ff526ed05cd958b80c.jpg','gallery','curated/11',11,'DJ VIC mixing at a private event in Bangalore'),
  ('/images/rf/ff3d91ead582e8b7a152679931daad5a.jpg','gallery','curated/12',12,'DJ VIC performing at a wedding cocktail hour'),
  ('/images/rf/056fb93002c33eaa1763e4e880c2eecd.jpg','gallery','curated/13',13,'DJ VIC performing with crowd visible at a club night'),
  ('/images/rf/0ed4bc46f1b6c558d03abac15e3ac199.jpg','gallery','curated/14',14,'DJ VIC on stage at a corporate gala evening'),
  ('/images/rf/bb614cf2b38f2b212cc415c0cf57deee.jpg','gallery','curated/15',15,'DJ VIC at a brand activation event in India'),
  ('/images/rf/cd1199f6cfd9a119850b2f34d49a1e9b.jpg','gallery','curated/16',16,'DJ VIC performing at a destination wedding celebration'),
  ('/images/rf/ce0766bc3ffa73fc87e8dfaf906738a9.jpg','gallery','curated/17',17,'DJ VIC behind the decks at a late-night set in Bangalore'),
  ('/images/rf/d222aeef9959bbddd0ef5e8ee8976664.jpg','gallery','curated/18',18,'DJ VIC at a high-energy dance floor event'),
  ('/images/rf/fe08c6a572f16d1240f67ba7bfd7db1c.jpg','gallery','curated/19',19,'DJ VIC mixing at a birthday celebration event in Bangalore'),
  ('/images/rf/126ec1d3128a6ef981a1c441bbf81f60.jpg','gallery','curated/20',20,'DJ VIC performing at an award ceremony in Bangalore'),
  ('/images/rf/1d6eeb6b40e1892ad04c43cf08ec89a3.jpg','gallery','curated/21',21,'DJ VIC at a product launch event in India'),
  ('/images/rf/3c8bf758088e7183b09a03f7fcbfd6a9.jpg','gallery','curated/22',22,'DJ VIC on stage at an outdoor festival performance'),
  ('/images/rf/6b7bdc87a5287ffe665ad959a29301ae.jpg','gallery','curated/23',23,'DJ VIC performing at a luxury wedding venue'),
  ('/images/rf/83ab4f60989d531b991915ff5eae456b.jpg','gallery','curated/24',24,'DJ VIC at a corporate annual day celebration'),
  ('/images/rf/c0199910b1e772b84eea44b34d52c783.jpg','gallery','curated/25',25,'DJ VIC behind the decks at a themed party event'),
  ('/images/rf/188a0ef5634fc8e5183570efd933d4cb.jpg','gallery','curated/26',26,'DJ VIC performing at a Hyatt hotel event in Bangalore'),
  ('/images/rf/08c724ec311ec5e595cb366401e0d8ff.jpg','gallery','curated/27',27,'DJ VIC at an anniversary celebration event'),
  ('/images/rf/1f95638535f32016a47b0deacc01ec00.jpg','gallery','curated/28',28,'DJ VIC performing at a Goa beach party'),
  ('/images/rf/87e451f54c478d9a3a09bbc70e6de835.jpg','gallery','curated/29',29,'DJ VIC at a club night with DJ booth lighting'),
  ('/images/rf/8af6dead5831ada33a771ca333ff9400.jpg','gallery','curated/30',30,'DJ VIC mixing at an international venue performance'),
  ('/images/rf/035a62b9d94630a5ac59f8fe1b8f1cc7.jpg','gallery','curated/31',31,'DJ VIC at a premium bar event in Bangalore'),
  ('/images/rf/083fe810983b545beddc2af7c3d1f058.jpg','gallery','curated/32',32,'DJ VIC performing at a corporate party in India'),
  ('/images/rf/21a5b0ba6fdbd10a2f44c432306785db.jpg','gallery','curated/33',33,'DJ VIC on the decks at a wedding sangeet night'),
  ('/images/rf/38757946d4f77aa7f52552c06f54812b.jpg','gallery','curated/34',34,'DJ VIC performing at a large-format live event'),
  ('/images/rf/48b9289351995dc5ce57d99323b5f4b0.jpg','gallery','curated/35',35,'DJ VIC at a concert stage performance'),
  ('/images/rf/501a58cd4c0ce74544201712fb90e356.jpg','gallery','curated/36',36,'DJ VIC at a rooftop event in Bangalore');
