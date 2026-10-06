-- ============================================================
-- War of the DJs — a shared track-planning board for a DJ battle set.
-- Used at /war-of-the-djs (unlisted). VIC and Rhea both add tracks from any
-- device; the list auto-collates and sorts by language for the client. Not
-- sensitive (just a song list), so the unlisted link may read/write freely.
-- Run once.
-- ============================================================
create table if not exists public.war_tracks (
  id          uuid primary key default gen_random_uuid(),
  event_slug  text not null default 'rakuten',   -- lets the page host more battles later (?e=)
  dj          text not null,                      -- 'VIC' | 'Rhea'
  track       text not null,
  lang        text,                               -- language / genre (used to group + sort)
  percussion  text,                               -- what Rhea plays live, e.g. "dhol on the drop"
  drum        boolean not null default false,     -- live-percussion flag (the 🥁 marker)
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists war_tracks_event_idx on public.war_tracks (event_slug, lang, created_at);

alter table public.war_tracks enable row level security;
grant select, insert, update, delete on public.war_tracks to anon, authenticated;

drop policy if exists "war read" on public.war_tracks;
create policy "war read" on public.war_tracks for select to anon, authenticated using (true);
drop policy if exists "war write" on public.war_tracks;
create policy "war write" on public.war_tracks for all to anon, authenticated using (true) with check (true);
