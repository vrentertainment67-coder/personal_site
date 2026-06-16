-- ============================================================
-- One-click gig emails (confirmation / invoice / follow-up).
-- RUN ONCE in the Supabase SQL editor (djvic project), after gig_finance.sql.
-- ============================================================

-- Client billing details on the gig (for the invoice "Bill To" block).
alter table bookings add column if not exists client_email   text;
alter table bookings add column if not exists client_company text;  -- Bill-To name if different from contact name
alter table bookings add column if not exists client_gstin   text;  -- optional, clients may have GST even though we don't
alter table bookings add column if not exists client_address text;

-- Log of every email sent from a gig (audit + "last sent" in the UI).
create table if not exists gig_emails (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references bookings(id) on delete cascade,
  kind        text not null,            -- confirmation | invoice | followup
  biller      text,                     -- vr | vic (for invoices)
  invoice_no  text,
  amount      numeric,
  to_email    text,
  status      text default 'sent',      -- sent | error
  detail      text,
  created_at  timestamptz not null default now()
);
create index if not exists gig_emails_booking_idx on gig_emails(booking_id);

alter table gig_emails enable row level security;
drop policy if exists "admin reads gig_emails" on gig_emails;
create policy "admin reads gig_emails" on gig_emails
  for select to authenticated using (true);

-- The function writes with the service role; admins read in the UI.
grant select on gig_emails to authenticated;
