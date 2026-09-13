-- ============================================================
-- DJ VIC — event guest-list RSVPs (homepage popup)
-- Public can INSERT their RSVP; only the logged-in admin can READ.
-- Run this in the Supabase SQL editor.
--
-- NOTE: an RLS policy alone is NOT enough — the role also needs a
-- base-table GRANT, or inserts fail with "permission denied" (42501).
-- ============================================================

create table if not exists public.event_rsvps (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  event       text not null default 'chamatkar-2026-06-13',
  name        text not null,
  phone       text not null,
  guests      int  not null default 1,
  entry_type  text,            -- 'couple' | 'stag' | null
  instagram   text,
  source      text,
  user_agent  text
);

alter table public.event_rsvps enable row level security;

-- Public submit (anon + authenticated may INSERT)
drop policy if exists "rsvp_public_insert" on public.event_rsvps;
create policy "rsvp_public_insert" on public.event_rsvps
  for insert to anon, authenticated
  with check (true);

-- Only the logged-in admin may READ the list
drop policy if exists "rsvp_admin_read" on public.event_rsvps;
create policy "rsvp_admin_read" on public.event_rsvps
  for select to authenticated
  using (true);

-- Base-table GRANTs (required in addition to the RLS policies above)
grant insert on public.event_rsvps to anon, authenticated;
grant select on public.event_rsvps to authenticated;

-- Let the logged-in admin remove test/spam RSVPs from the /admin Guest List
drop policy if exists "rsvp_admin_delete" on public.event_rsvps;
create policy "rsvp_admin_delete" on public.event_rsvps
  for delete to authenticated
  using (true);
grant delete on public.event_rsvps to authenticated;

-- Let the logged-in admin fix wrongly-typed numbers (and other fields) in the
-- /admin Guest List before sending WhatsApp follow-ups.
drop policy if exists "rsvp_admin_update" on public.event_rsvps;
create policy "rsvp_admin_update" on public.event_rsvps
  for update to authenticated
  using (true) with check (true);
grant update on public.event_rsvps to authenticated;

-- Helpful index for the admin list (newest first)
create index if not exists event_rsvps_created_idx on public.event_rsvps (created_at desc);

-- One-time cleanup: reduce pasted Instagram values (full instagram.com URLs,
-- leading @, stray spaces) down to the bare handle. Safe to re-run — clean
-- handles are left untouched; anything that reduces to nothing becomes NULL.
update public.event_rsvps
set instagram = nullif(
  regexp_replace(                                         -- 3) stop at first illegal char
    regexp_replace(                                       -- 2) drop a leading @
      regexp_replace(instagram, '^.*instagram\.com/', '', 'i'),   -- 1) strip URL up to the handle
    '^@+', ''),
  '[^A-Za-z0-9._].*$', ''),
  '')
where instagram is not null;
