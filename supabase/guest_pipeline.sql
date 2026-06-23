-- ── The VIC Fix · Guest Pipeline ─────────────────────────────────────────
-- Manual tracker for prospective podcast guests. Lives under the Podcast tab.
-- When a guest is marked "shot", the row stays (history) but drops out of the
-- active list. Instagram followers are pulled on demand via the instagram-stats
-- edge function (Apify) and cached here.

create table if not exists public.guest_pipeline (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  industry      text,
  instagram     text,                       -- handle, with or without @
  ig_followers  bigint,                     -- cached follower count
  ig_verified   boolean,                    -- blue tick
  ig_checked_at timestamptz,                -- last time we pulled from Apify
  shoot_date    date,                       -- planned interview/shoot date (any day)
  release_date  date,                       -- planned premiere date (a Sunday)
  status        text not null default 'lead',  -- lead | contacted | confirmed
  shot          boolean not null default false, -- shooting done → archived
  notes         text,
  created_at    timestamptz not null default now()
);

create index if not exists guest_pipeline_active_idx on public.guest_pipeline (shot, shoot_date);

-- Migration for tables created before the shoot/release split (idempotent):
--   do $$ begin if exists (select 1 from information_schema.columns
--     where table_name='guest_pipeline' and column_name='planned_date')
--   then alter table public.guest_pipeline rename column planned_date to shoot_date; end if; end $$;
--   alter table public.guest_pipeline add column if not exists release_date date;

alter table public.guest_pipeline enable row level security;

-- Admin (signed-in) has full access; the public site never touches this table.
drop policy if exists gp_admin_all on public.guest_pipeline;
create policy gp_admin_all on public.guest_pipeline
  for all to authenticated using (true) with check (true);

-- The recurring grant gotcha — RLS policy alone isn't enough for PostgREST.
grant all on public.guest_pipeline to authenticated;

notify pgrst, 'reload schema';
