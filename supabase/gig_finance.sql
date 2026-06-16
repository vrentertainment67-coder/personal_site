-- ============================================================
-- Gig financials for the admin Bookings tab.
-- Adds an agreed fee on each booking + a payments ledger.
-- RUN ONCE in the Supabase SQL editor (djvic project).
-- ============================================================

-- 1. Agreed fee on the gig itself (authenticated already has UPDATE on bookings).
alter table bookings add column if not exists agreed_fee numeric;

-- 2. Payments ledger — one row per payment received against a gig.
create table if not exists gig_payments (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references bookings(id) on delete cascade,
  amount      numeric not null check (amount > 0),
  paid_on     date not null default current_date,
  method      text,           -- UPI / Cash / Bank / Card / Other
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists gig_payments_booking_idx on gig_payments(booking_id);

-- 3. RLS: no anonymous access; any logged-in admin has full access.
alter table gig_payments enable row level security;
drop policy if exists "admin manages gig_payments" on gig_payments;
create policy "admin manages gig_payments" on gig_payments
  for all to authenticated using (true) with check (true);

-- 4. GRANT — the recurring gotcha: an RLS policy is NOT enough on its own,
--    the role also needs the base-table privilege or you get 42501.
grant select, insert, update, delete on gig_payments to authenticated;
