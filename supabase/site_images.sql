-- ============================================================
-- DJ VIC — site image overrides (admin "Page Images" tab)
-- Maps a slot key -> a Cloudinary image. The site swaps the image live on load.
-- RUN ONCE in the Supabase SQL editor.
-- ============================================================
create table if not exists public.site_images (
  slot text primary key,
  url text not null,
  public_id text,
  updated_at timestamptz default now()
);

alter table public.site_images enable row level security;

grant select on public.site_images to anon, authenticated;
grant insert, update, delete on public.site_images to authenticated;

drop policy if exists "public read site images" on public.site_images;
create policy "public read site images"
  on public.site_images for select to anon using (true);

drop policy if exists "admin manage site images" on public.site_images;
create policy "admin manage site images"
  on public.site_images for all to authenticated using (true) with check (true);
