-- ============================================================
-- DJ VIC — VIC Fix podcast guest applications (replaces Formspree)
-- Public can INSERT an application; only the logged-in admin can READ/DELETE.
-- Run this in the Supabase SQL editor.
--
-- NOTE: an RLS policy alone is NOT enough — the role also needs a
-- base-table GRANT, or inserts fail with "permission denied" (42501).
-- ============================================================

create table if not exists public.podcast_applications (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null,
  email       text,
  phone       text,
  instagram   text,
  role        text,
  story       text,
  source      text,
  user_agent  text
);

alter table public.podcast_applications enable row level security;

-- Public submit (anon + authenticated may INSERT)
drop policy if exists "podcast_public_insert" on public.podcast_applications;
create policy "podcast_public_insert" on public.podcast_applications
  for insert to anon, authenticated
  with check (true);

-- Only the logged-in admin may READ
drop policy if exists "podcast_admin_read" on public.podcast_applications;
create policy "podcast_admin_read" on public.podcast_applications
  for select to authenticated
  using (true);

-- Only the logged-in admin may DELETE
drop policy if exists "podcast_admin_delete" on public.podcast_applications;
create policy "podcast_admin_delete" on public.podcast_applications
  for delete to authenticated
  using (true);

-- Base-table GRANTs (required in addition to the RLS policies)
grant insert on public.podcast_applications to anon, authenticated;
grant select, delete on public.podcast_applications to authenticated;

create index if not exists podcast_applications_created_idx
  on public.podcast_applications (created_at desc);
