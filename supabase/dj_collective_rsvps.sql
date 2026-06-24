-- ── The DJ Collective, Bengaluru — recurring meetup RSVPs ────────────────
-- Anon (public site) can INSERT only. No select/update/delete for anon, so
-- the guest list stays private. Read counts as the owner in the SQL editor.

create table if not exists public.dj_collective_rsvps (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null,
  dj_name     text,
  genre       text,
  years       text,
  instagram   text,
  phone       text not null,
  session     text,            -- e.g. "2026-07-launch" (set per edition in the component)
  status      text default 'rsvp'
);

alter table public.dj_collective_rsvps enable row level security;

-- Anonymous INSERT only (matches how the guest form writes with the anon key).
drop policy if exists djc_anon_insert on public.dj_collective_rsvps;
create policy djc_anon_insert on public.dj_collective_rsvps
  for insert to anon, authenticated
  with check (true);

-- RLS policy alone isn't enough — the role also needs the base-table GRANT.
grant insert on public.dj_collective_rsvps to anon, authenticated;

-- Private count-by-session view (NOT granted to anon → only the owner /
-- service role can read it, e.g. from the Supabase SQL editor).
create or replace view public.dj_collective_rsvp_counts as
  select session, count(*) as rsvps, max(created_at) as latest
  from public.dj_collective_rsvps
  group by session
  order by session;

notify pgrst, 'reload schema';

-- One-line count query (run in the SQL editor):
--   select session, count(*) from dj_collective_rsvps group by session order by session;
