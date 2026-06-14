-- ============================================================
-- DJ VIC — events registry (powers the homepage guest-list popup
-- and the admin Events / Guest List / re-invite flow)
-- Run this in the Supabase SQL editor.
--
-- The homepage popup reads the single row where active = true AND
-- guestlist_enabled = true (anon can only read active rows). The
-- admin (authenticated) manages all events.
-- ============================================================

create table if not exists public.events (
  id                uuid primary key default gen_random_uuid(),
  slug              text unique not null,        -- e.g. 'chamatkar-2026-06-13'
  title             text not null,
  venue             text,
  area              text,
  date_label        text,                        -- "Saturday, 13 June"
  time_label        text,                        -- "9:00 PM onwards"
  lineup            text,                        -- "DJ VIC"
  genre             text,                        -- "Bollywood / Commercial — Audio-Visual Set"
  banner_url        text,                        -- Cloudinary URL or /images/… (optional)
  rsvp_cutoff       timestamptz,                 -- RSVP form closes
  expiry            timestamptz,                 -- popup stops showing entirely
  guestlist_enabled boolean not null default true,
  active            boolean not null default false,  -- the one shown on the homepage
  created_at        timestamptz not null default now()
);

alter table public.events enable row level security;

-- Public (popup) can read ONLY the live event(s)
drop policy if exists "events_public_read_active" on public.events;
create policy "events_public_read_active" on public.events
  for select to anon
  using (active = true);

-- Admin manages everything
drop policy if exists "events_admin_all" on public.events;
create policy "events_admin_all" on public.events
  for all to authenticated
  using (true) with check (true);

-- Base-table grants (required in addition to the RLS policies)
grant select on public.events to anon;
grant select, insert, update, delete on public.events to authenticated;

-- Seed the first event (Chamatkar). It's already past, so active = false
-- (no popup); it becomes the first entry in Past Events + the guest CRM.
insert into public.events
  (slug, title, venue, area, date_label, time_label, lineup, genre, banner_url, rsvp_cutoff, expiry, guestlist_enabled, active)
values
  ('chamatkar-2026-06-13', 'Chamatkar', 'Happy Brew', 'Koramangala, Bangalore',
   'Saturday, 13 June', '9:00 PM onwards', 'DJ VIC', 'Bollywood / Commercial — Audio-Visual Set',
   '/images/chamatkar.jpg',
   '2026-06-13T18:00:00+05:30', '2026-06-14T01:00:00+05:30', true, false)
on conflict (slug) do nothing;
