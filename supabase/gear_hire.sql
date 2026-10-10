-- ============================================================
-- Gear hire — a shared-asset rental ledger (e.g. the Bose L1 Pro16 co-owned
-- by VIC & Thanush). Each hire logs the fee and any expenses; net profit is
-- split by a configurable %, and each owner's share is tracked against what
-- they invested so you can see recovery. Admin-only. RUN ONCE in Supabase.
-- ============================================================
create table if not exists public.gear_assets (
  id               uuid primary key default gen_random_uuid(),
  name             text not null default 'Bose L1 Pro16',
  vic_invested     numeric not null default 0,       -- VIC's capital in
  partner_name     text not null default 'Thanush',
  partner_invested numeric not null default 0,       -- partner's capital in
  vic_split        numeric not null default 50,      -- VIC's % of net profit (partner gets the rest)
  created_at       timestamptz not null default now()
);

create table if not exists public.gear_hires (
  id         uuid primary key default gen_random_uuid(),
  asset_id   uuid not null references public.gear_assets(id) on delete cascade,
  hired_on   date not null default current_date,
  client     text,                                   -- who hired it / the event
  fee        numeric not null default 0,             -- hire charge (gross)
  expenses   numeric not null default 0,             -- transport / crew / consumables
  notes      text,
  created_at timestamptz not null default now()
);
create index if not exists gear_hires_asset_idx on public.gear_hires(asset_id, hired_on desc);

alter table public.gear_assets enable row level security;
alter table public.gear_hires  enable row level security;
drop policy if exists "admin gear_assets" on public.gear_assets;
create policy "admin gear_assets" on public.gear_assets for all to authenticated using (true) with check (true);
drop policy if exists "admin gear_hires" on public.gear_hires;
create policy "admin gear_hires" on public.gear_hires for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.gear_assets to authenticated;
grant select, insert, update, delete on public.gear_hires  to authenticated;

-- Seed the Bose as the first asset (only if none exist yet).
insert into public.gear_assets (name)
select 'Bose L1 Pro16'
where not exists (select 1 from public.gear_assets);
