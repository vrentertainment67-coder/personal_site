-- ── bookings: advance (blocking amount) ────────────────────────────────
-- Some clients pay a part of the fee up front to block the date, with the
-- balance settled on the event day. `advance_amount` is the AGREED blocking
-- amount — what they committed to, not what's arrived.
--
-- What's actually received still lives in the `gig_payments` ledger, so:
--     advance still due = advance_amount - sum(gig_payments)   (floored at 0)
--     balance on the day = agreed_fee - sum(gig_payments) - tds_amount
--
-- Nothing else changes: a gig with no advance behaves exactly as before.
-- Idempotent: safe to re-run.

alter table public.bookings add column if not exists advance_amount numeric;

-- `authenticated` already holds a table-wide UPDATE grant (bookings_fee_grant_fix.sql),
-- which covers new columns automatically. Re-asserted here so this file stands alone
-- and never repeats the column-grant gotcha that blocked agreed_fee.
grant update on public.bookings to authenticated;

notify pgrst, 'reload schema';
