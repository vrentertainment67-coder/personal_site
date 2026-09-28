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

-- ============================================================
-- COUPLE'S OWN PRIVATE LIST (/requests/bride/?c=<slug>&k=<key>)
-- The couple gets a private link with no 3-song cap where they can add songs,
-- see their running list and remove entries. Their rows live in this same
-- song_requests table (so VIC sees them in the admin), tagged with a secret
-- owner_key from the link and, optionally, which function the song is for.
-- Guests still cannot read the table; the couple reads/removes only their own
-- rows through the two security-definer functions below, scoped to their key.
-- ============================================================
alter table public.song_requests add column if not exists owner_key text;   -- secret from the couple's private link (guests: null)
alter table public.song_requests add column if not exists sub_event text;    -- optional: 'Cocktail' | 'Sangeet' | 'Mehndi'

-- List the couple's own entries (only rows matching their slug + secret key).
create or replace function public.bride_list_requests(p_slug text, p_key text)
returns table (id uuid, song text, guest_name text, sub_event text, created_at timestamptz)
language sql security definer stable
set search_path = public
as $$
  select id, song, guest_name, sub_event, created_at
  from public.song_requests
  where couple_slug = p_slug and owner_key is not null and owner_key = p_key
  order by created_at asc
$$;

-- Remove one of the couple's own entries (must match id + slug + key).
create or replace function public.bride_delete_request(p_id uuid, p_slug text, p_key text)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare n integer;
begin
  delete from public.song_requests
  where id = p_id and couple_slug = p_slug and owner_key is not null and owner_key = p_key;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.bride_list_requests(text, text) from public;
revoke all on function public.bride_delete_request(uuid, text, text) from public;
grant execute on function public.bride_list_requests(text, text) to anon, authenticated;
grant execute on function public.bride_delete_request(uuid, text, text) to anon, authenticated;

-- ============================================================
-- COUPLE LIST — extras: must-play star, reference link, do-not-play flag.
-- ============================================================
alter table public.song_requests add column if not exists sub_event text;                            -- (defensive) 'Cocktail' | 'Sangeet' | 'Mehndi'
alter table public.song_requests add column if not exists is_avoid  boolean not null default false;  -- true = "please don't play"
alter table public.song_requests add column if not exists must_play boolean not null default false;  -- couple's non-negotiables
alter table public.song_requests add column if not exists ref_url   text;                             -- exact-version reference link

-- List now returns the extra fields (return type changed → drop first).
drop function if exists public.bride_list_requests(text, text);
create or replace function public.bride_list_requests(p_slug text, p_key text)
returns table (id uuid, song text, guest_name text, sub_event text, is_avoid boolean, must_play boolean, ref_url text, created_at timestamptz)
language sql security definer stable
set search_path = public
as $$
  select id, song, guest_name, sub_event, is_avoid, must_play, ref_url, created_at
  from public.song_requests
  where couple_slug = p_slug and owner_key is not null and owner_key = p_key
  order by created_at asc
$$;
revoke all on function public.bride_list_requests(text, text) from public;
grant execute on function public.bride_list_requests(text, text) to anon, authenticated;

-- Toggle must-play / set-or-clear the reference link on one of the couple's rows.
create or replace function public.bride_update_request(p_id uuid, p_slug text, p_key text, p_must_play boolean, p_ref_url text)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare n integer;
begin
  update public.song_requests
  set must_play = coalesce(p_must_play, must_play),
      ref_url   = p_ref_url
  where id = p_id and couple_slug = p_slug and owner_key is not null and owner_key = p_key;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.bride_update_request(uuid, text, text, boolean, text) from public;
grant execute on function public.bride_update_request(uuid, text, text, boolean, text) to anon, authenticated;
