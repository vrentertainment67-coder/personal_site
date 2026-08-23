-- ============================================================
-- Wedding song requests — guests submit requests at /requests?c=<slug>;
-- VIC reviews them in the admin and builds the playlist. Run once.
-- ============================================================

-- One row per wedding/couple.
create table if not exists public.request_couples (
  slug         text primary key,            -- URL key: /requests?c=ram
  couple_names text not null,               -- shown on the page, e.g. "Ram" or "Ram & Priya"
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);
alter table public.request_couples enable row level security;

-- Anyone can read the couple label (to render the page); admin manages them.
grant select on public.request_couples to anon, authenticated;
drop policy if exists "public read couples" on public.request_couples;
create policy "public read couples" on public.request_couples
  for select to anon, authenticated using (true);
grant insert, update, delete on public.request_couples to authenticated;
drop policy if exists "admin writes couples" on public.request_couples;
create policy "admin writes couples" on public.request_couples
  for all to authenticated using (true) with check (true);

-- The requests themselves.
create table if not exists public.song_requests (
  id           uuid primary key default gen_random_uuid(),
  couple_slug  text not null,
  guest_name   text not null,
  guest_email  text,
  song         text not null,
  created_at   timestamptz not null default now()
);
create index if not exists song_requests_couple_idx on public.song_requests (couple_slug, created_at desc);
alter table public.song_requests enable row level security;

-- Guests may add requests and nothing else — they cannot read the list back
-- (privacy: names + emails stay admin-only).
grant insert on public.song_requests to anon;
drop policy if exists "public insert requests" on public.song_requests;
create policy "public insert requests" on public.song_requests
  for insert to anon with check (true);
grant select, insert, update, delete on public.song_requests to authenticated;
drop policy if exists "admin all requests" on public.song_requests;
create policy "admin all requests" on public.song_requests
  for all to authenticated using (true) with check (true);

-- First couple.
insert into public.request_couples (slug, couple_names) values ('ram', 'Ram')
on conflict (slug) do nothing;
