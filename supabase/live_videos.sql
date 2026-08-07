-- ============================================================
-- Live footage showreel — videos categorised by language, shown on the
-- unlisted /live page and managed from the admin (drag-drop upload).
-- Public read (the page is unlisted, not private); admin writes. Run once.
-- ============================================================

create table if not exists public.live_videos (
  id            uuid primary key default gen_random_uuid(),
  language      text not null,                 -- category: Tamil, Telugu, Kannada, Hindi, English…
  title         text,                          -- optional label (venue / event)
  url           text not null,                 -- hosted video (Cloudinary secure_url)
  thumbnail_url text,                           -- poster frame (derived at upload)
  sort_order    int  not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists live_videos_lang_idx on public.live_videos (language, sort_order);

alter table public.live_videos enable row level security;

-- Public (anon) read — the /live page loads these client-side. It's unlisted,
-- not secret; there's nothing sensitive here, only showreel clips.
grant select on public.live_videos to anon, authenticated;
drop policy if exists "public read live_videos" on public.live_videos;
create policy "public read live_videos"
  on public.live_videos for select
  to anon, authenticated
  using (true);

-- Admin full control.
grant insert, update, delete on public.live_videos to authenticated;
drop policy if exists "admin writes live_videos" on public.live_videos;
create policy "admin writes live_videos"
  on public.live_videos for all
  to authenticated
  using (true) with check (true);
