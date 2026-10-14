-- ============================================================
-- DJ VIC — backfill confirmed/lost gigs into the bookings admin.
-- These events already exist on Google Calendar, so this ONLY writes the
-- booking records (no calendar-sync side effects). Mirrors the admin
-- ManualEntry insert shape exactly, so the CRM trigger + totals behave
-- like any manually-added gig.
--
--   status 'accepted'  → shows as "Confirmed", fee counts toward earned.
--   status 'declined'  → shows as "Declined/Lost", not counted; lost_reason set.
--
-- Fees per DJ VIC: Akira Orchards ₹70,000 · Manav Goel ₹50,000.
-- Shangri-La and The Wedding Factory did NOT happen → marked lost.
-- Idempotent: re-running won't duplicate (matches on name + event_date).
-- RUN ONCE in the Supabase SQL editor.
-- ============================================================
insert into public.bookings
  (name, contact, event_type, event_date, event_end_date, venue, city, agreed_fee, status, lost_reason, source, message)
select
  v.name, v.contact, v.event_type, v.event_date, v.event_end_date, v.venue, v.city,
  v.agreed_fee, v.status, v.lost_reason, 'manual', v.message
from (values
  -- ── Confirmed gigs ────────────────────────────────────────
  ('HMG Stones',          '—',               'corporate', date '2026-04-10', date '2026-04-10', null,                 'Bangalore', 160000::numeric, 'accepted', null,             'Backfilled from calendar. Total ₹1.6L.'),
  ('Indigaga',            '—',               'nightlife', date '2026-04-24', date '2026-04-24', null,                 'Bangalore',  50000::numeric, 'accepted', null,             'Backfilled from calendar. Club night.'),
  ('Akira Orchards',      '—',               'other',     date '2026-05-23', date '2026-05-23', 'Akira Orchards',     null,         70000::numeric, 'accepted', null,             'Backfilled from calendar.'),
  ('Manav Goel',          'Manav Goel',      'private',   date '2026-05-24', null,              null,                 null,         50000::numeric, 'accepted', null,             'Backfilled from calendar. Quoted ₹50k.'),
  -- ── Did not happen (lost) ─────────────────────────────────
  ('Shangri-La Bangalore','Aditi',           'corporate', date '2026-06-12', date '2026-06-12', 'Shangri-La Hotel',   'Bangalore', null::numeric,   'declined', 'Did not happen', 'Backfilled from calendar. ₹80k quoted — did not happen.'),
  ('The Wedding Factory', 'Bobby L.N. Jeky', 'wedding',   date '2026-08-28', date '2026-08-30', null,                 null,        null::numeric,   'declined', 'Did not happen', 'Backfilled from calendar. Profile-videos enquiry — did not happen.')
) as v(name, contact, event_type, event_date, event_end_date, venue, city, agreed_fee, status, lost_reason, message)
where not exists (
  select 1 from public.bookings b
  where b.name = v.name
    and coalesce(b.event_date, date '1900-01-01') = coalesce(v.event_date, date '1900-01-01')
);
