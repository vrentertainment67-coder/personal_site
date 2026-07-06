-- ── Event media: admin-managed photos & videos (reels) per event ─────────
-- The public event page reads these (anon select); the admin manages them.
create table if not exists public.event_media (
  id          uuid primary key default gen_random_uuid(),
  event_slug  text not null,                       -- ties to events.slug
  type        text not null default 'video' check (type in ('video', 'photo')),
  url         text not null,                        -- YouTube/Shorts link or ID, mp4 URL, or image URL
  caption     text,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists event_media_slug_idx on public.event_media (event_slug, sort_order, created_at);

alter table public.event_media enable row level security;

-- Public read (the event page renders them).
drop policy if exists em_anon_read on public.event_media;
create policy em_anon_read on public.event_media for select to anon, authenticated using (true);
grant select on public.event_media to anon, authenticated;

-- Admin (signed-in) manages.
drop policy if exists em_admin_write on public.event_media;
create policy em_admin_write on public.event_media for all to authenticated using (true) with check (true);
grant insert, update, delete on public.event_media to authenticated;

notify pgrst, 'reload schema';
