-- ============================================================
-- Studio finance — tracks money received for website builds & social-media
-- work (VIC's services arm), in the admin "Studio" tab. A project per client
-- engagement + a simple payments ledger. Admin-only (no anon access).
-- RUN ONCE in the Supabase SQL editor.
-- ============================================================
create table if not exists public.studio_projects (
  id         uuid primary key default gen_random_uuid(),
  client     text not null,
  contact    text,
  type       text not null default 'website',   -- 'website' | 'social' | 'other'
  title      text,                                -- short description, e.g. "5-page Astro site"
  amount     numeric,                             -- agreed value (nullable: ongoing / TBD)
  status     text not null default 'active',      -- 'lead' | 'active' | 'delivered' | 'closed'
  started_on date default current_date,
  notes      text,
  created_at timestamptz not null default now()
);

create table if not exists public.studio_payments (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.studio_projects(id) on delete cascade,
  amount     numeric not null check (amount > 0),
  paid_on    date not null default current_date,
  method     text,                                -- UPI / Bank / Cash / Card / Other
  note       text,
  created_at timestamptz not null default now()
);
create index if not exists studio_payments_project_idx on public.studio_payments(project_id);

alter table public.studio_projects enable row level security;
alter table public.studio_payments enable row level security;

drop policy if exists "admin studio_projects" on public.studio_projects;
create policy "admin studio_projects" on public.studio_projects for all to authenticated using (true) with check (true);
drop policy if exists "admin studio_payments" on public.studio_payments;
create policy "admin studio_payments" on public.studio_payments for all to authenticated using (true) with check (true);

-- GRANT (RLS alone isn't enough — base-table privilege is needed too):
grant select, insert, update, delete on public.studio_projects to authenticated;
grant select, insert, update, delete on public.studio_payments to authenticated;
