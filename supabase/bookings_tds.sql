-- Per-gig TDS (tax deducted at source). Clients often deduct 10% and pay the
-- rest; TDS is income received-in-kind (paid to the govt on your behalf), not
-- an outstanding balance. Store the amount so the ledger settles correctly.
alter table public.bookings add column if not exists tds_amount numeric;
-- Table-level UPDATE grant so authenticated (admin) can write the new column.
grant update on public.bookings to authenticated;
notify pgrst, 'reload schema';
