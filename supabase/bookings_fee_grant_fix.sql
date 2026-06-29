-- ── Fix: admin can't edit a booking's price (agreed_fee) ────────────────
-- Symptom: changing any other field (status, date, venue…) saves fine, but
-- saving the Fee ₹ / Amount fails. Root cause is the Postgres column-grant
-- gotcha: `authenticated` was originally given UPDATE on a *specific column
-- list* of public.bookings. `agreed_fee` was added later (gig_finance.sql),
-- so it falls outside that list → "permission denied for column agreed_fee".
--
-- A table-level UPDATE grant covers every column, present and future.
-- Idempotent: safe to re-run.
grant update on public.bookings to authenticated;

notify pgrst, 'reload schema';

-- Verify (run separately, as the table owner):
--   select privilege_type, column_name
--   from information_schema.column_privileges
--   where table_name = 'bookings' and grantee = 'authenticated' and privilege_type = 'UPDATE';
-- A single row with column_name = NULL means the grant is table-wide (fixed).
