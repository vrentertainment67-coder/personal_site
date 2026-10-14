-- ============================================================
-- DJ VIC — backfill completed/lost gigs into the bookings admin.
-- These events already exist on Google Calendar, so this ONLY writes the
-- booking records (no calendar-sync side effects). Mirrors the admin
-- ManualEntry insert shape, so the CRM trigger + totals behave normally.
--
--   status 'completed' → "Completed · Paid"; a full-fee payment is logged in
--                        gig_payments below so the balance is zero (not "owing").
--   status 'declined'  → "Declined/Lost", not counted; lost_reason set.
--
-- Fees per DJ VIC: Akira Orchards ₹70,000 · Manav Goel ₹50,000.
-- Shangri-La and The Wedding Factory did NOT happen → marked lost.
-- Idempotent: re-running won't duplicate bookings or payments.
-- RUN ONCE in the Supabase SQL editor.
-- ============================================================

-- 1) The gigs ------------------------------------------------
insert into public.bookings
  (name, contact, event_type, event_date, event_end_date, venue, city, agreed_fee, status, lost_reason, source, message)
select
  v.name, v.contact, v.event_type, v.event_date, v.event_end_date, v.venue, v.city,
  v.agreed_fee, v.status, v.lost_reason, 'manual', v.message
from (values
  -- ── Completed (done & paid) ───────────────────────────────
  ('HMG Stones',          '—',               'corporate', date '2026-04-10', date '2026-04-10', null,               'Bangalore', 160000::numeric, 'completed', null,             'Backfilled from calendar. Total ₹1.6L.'),
  ('Indigaga',            '—',               'nightlife', date '2026-04-24', date '2026-04-24', null,               'Bangalore',  50000::numeric, 'completed', null,             'Backfilled from calendar. Club night.'),
  ('Akira Orchards',      '—',               'other',     date '2026-05-23', date '2026-05-23', 'Akira Orchards',   null,         70000::numeric, 'completed', null,             'Backfilled from calendar.'),
  ('Manav Goel',          'Manav Goel',      'private',   date '2026-05-24', null,              null,               null,         50000::numeric, 'completed', null,             'Backfilled from calendar. ₹50k.'),
  -- ── Did not happen (lost) ─────────────────────────────────
  ('Shangri-La Bangalore','Aditi',           'corporate', date '2026-06-12', date '2026-06-12', 'Shangri-La Hotel', 'Bangalore', null::numeric,   'declined', 'Did not happen', 'Backfilled from calendar. ₹80k quoted — did not happen.'),
  ('The Wedding Factory', 'Bobby L.N. Jeky', 'wedding',   date '2026-08-28', date '2026-08-30', null,               null,        null::numeric,   'declined', 'Did not happen', 'Backfilled from calendar. Profile-videos enquiry — did not happen.')
) as v(name, contact, event_type, event_date, event_end_date, venue, city, agreed_fee, status, lost_reason, message)
where not exists (
  select 1 from public.bookings b
  where b.name = v.name
    and coalesce(b.event_date, date '1900-01-01') = coalesce(v.event_date, date '1900-01-01')
);

-- 2) Full payment for each completed backfilled gig (zero balance) --------
insert into public.gig_payments (booking_id, amount, paid_on, method, note)
select b.id, b.agreed_fee, coalesce(b.event_date, current_date), 'Backfill', 'Backfilled — paid in full'
from public.bookings b
join (values
  ('HMG Stones',     date '2026-04-10'),
  ('Indigaga',       date '2026-04-24'),
  ('Akira Orchards', date '2026-05-23'),
  ('Manav Goel',     date '2026-05-24')
) as g(name, event_date) on g.name = b.name and g.event_date = b.event_date
where b.status = 'completed'
  and b.agreed_fee is not null
  and not exists (select 1 from public.gig_payments p where p.booking_id = b.id);
