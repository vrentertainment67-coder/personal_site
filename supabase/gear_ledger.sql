-- ============================================================
-- Gear ledger — one shared running ledger for co-owned gear (Bose L1 Pro16 &
-- accessories). Each row is an Investment, Income (hire) or Expense, with an
-- explicit Vicky/Dhanush split and who paid. The admin computes the running
-- balance and recovery. Admin-only. RUN ONCE in Supabase.
-- (Replaces the earlier gear_assets / gear_hires model.)
-- ============================================================
create table if not exists public.gear_ledger (
  id            uuid primary key default gen_random_uuid(),
  entry_date    date not null default current_date,
  description   text not null,
  type          text not null default 'income',   -- 'investment' | 'income' | 'expense'
  amount        numeric not null default 0,        -- total amount (positive)
  vic_share     numeric not null default 0,        -- Vicky's share of this amount
  dhanush_share numeric not null default 0,        -- Dhanush's share
  paid_by       text,                               -- Both / Vicky / Dhanush / Cash / Client …
  remarks       text,
  created_at    timestamptz not null default now()
);
alter table public.gear_ledger enable row level security;
drop policy if exists "admin gear_ledger" on public.gear_ledger;
create policy "admin gear_ledger" on public.gear_ledger for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.gear_ledger to authenticated;

-- Optional: the earlier tables are no longer used — uncomment to remove them.
-- drop table if exists public.gear_hires;
-- drop table if exists public.gear_assets;
