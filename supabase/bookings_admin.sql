-- ── bookings: admin enquiry/gig support ─────────────────────────────────
-- Applied live 2026-06-20. Documents two changes the admin relies on:
--   1. event_end_date  — multi-day enquiries/gigs (e.g. Sep 22–23).
--   2. event_type      — the CHECK list originally allowed only the 4 public
--      form types; the admin offers 3 more (corporate / dj class / training),
--      so an admin insert hit "violates check constraint
--      bookings_event_type_check". Widen it to the full admin set.
-- Idempotent: safe to re-run.

alter table public.bookings add column if not exists event_end_date date;

alter table public.bookings drop constraint if exists bookings_event_type_check;
alter table public.bookings add constraint bookings_event_type_check
  check (event_type = any (array[
    'sangeet','wedding','nightlife','private','festival','corporate','dj class','training','other'
  ]));

notify pgrst, 'reload schema';
