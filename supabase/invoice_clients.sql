-- ============================================================
-- Saved invoice clients — an optional address book for repeat-business
-- clients, so the invoice "Bill To" block can be pre-filled from a picker.
-- Admin-only. RUN ONCE in the Supabase SQL editor.
-- ============================================================
create table if not exists public.invoice_clients (
  id         uuid primary key default gen_random_uuid(),
  label      text not null,          -- how it shows in the picker, e.g. "Infosys — Priya"
  company    text,                   -- Bill-To company name
  email      text,
  phone      text,
  gstin      text,
  address    text,
  created_at timestamptz not null default now()
);
alter table public.invoice_clients enable row level security;
drop policy if exists "admin invoice_clients" on public.invoice_clients;
create policy "admin invoice_clients" on public.invoice_clients for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.invoice_clients to authenticated;
