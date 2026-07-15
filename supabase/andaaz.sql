-- ============================================================
-- ANDAAZ — nightlife brand event pages (/andaaz)
-- Run this ONCE in the Supabase SQL editor BEFORE the page goes live.
--
-- Andaaz reuses the existing Chamatkar plumbing: RSVPs land in
-- `event_rsvps` tagged by the event slug, and the `events` row is what
-- makes the guest list appear in /admin → Events.
-- ============================================================

-- 1) Andaaz collects an email (Chamatkar does not). Additive + nullable,
--    so every existing RSVP row and the Chamatkar form are unaffected.
alter table public.event_rsvps add column if not exists email text;

-- 2) Register each Andaaz edition. `active` stays FALSE so Andaaz never
--    hijacks the DJ VIC homepage popup (that flag is for the homepage event).
--    To add a future edition: copy this block, change the slug/title/dates.
insert into public.events
  (slug, title, venue, area, date_label, time_label, lineup, genre, banner_url, rsvp_cutoff, expiry, guestlist_enabled, active)
values
  ('andaaz-2026-08-29',
   'Andaaz Republic',
   'Jollygunj',
   'JP Nagar, Bangalore',
   'Saturday 29 August',
   '8:00 PM onwards',
   'DJ VIC',
   'Bollywood × English — premium lounge',
   '/images/andaaz-emblem-900.webp',
   '2026-08-29T13:00:00+00:00',   -- RSVP form closes (6:30 PM IST)
   '2026-08-30T00:00:00+00:00',   -- page stops accepting entirely (5:30 AM IST)
   true,
   false)
on conflict (slug) do nothing;

-- 3) Make PostgREST pick up the new column immediately.
notify pgrst, 'reload schema';
