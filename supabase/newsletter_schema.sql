-- ============================================================
-- DJ VIC Newsletter Schema
-- Run once in Supabase SQL editor.
-- ============================================================

-- Key-value store for Resend audience IDs + config
create table if not exists newsletter_config (
  key   text primary key,
  value text not null,
  updated_at timestamptz default now()
);

-- All captured email contacts (source of truth)
create table if not exists subscribers (
  id            uuid primary key default gen_random_uuid(),
  email         text unique not null,
  name          text,
  source        text default 'website', -- footer | vicfix | manual | booking
  list          text default 'monthly', -- monthly | weekly | both
  status        text default 'active',  -- active | unsubscribed
  subscribed_at timestamptz default now()
);

-- Newsletter send history
create table if not exists newsletter_drafts (
  id                   uuid primary key default gen_random_uuid(),
  subject              text not null,
  html                 text not null,
  audience             text default 'monthly',
  status               text default 'draft',  -- draft | sent
  resend_broadcast_id  text,
  recipient_count      integer default 0,
  created_at           timestamptz default now(),
  sent_at              timestamptz
);

-- GRANTs (authenticated = logged-in admin)
grant select, insert, update, delete on newsletter_config to authenticated;
grant select, insert, update         on subscribers        to authenticated;
grant select, insert, update         on newsletter_drafts  to authenticated;

-- RLS
alter table newsletter_config  enable row level security;
alter table subscribers        enable row level security;
alter table newsletter_drafts  enable row level security;

create policy "auth_all" on newsletter_config  for all to authenticated using (true) with check (true);
create policy "auth_all" on subscribers        for all to authenticated using (true) with check (true);
create policy "auth_all" on newsletter_drafts  for all to authenticated using (true) with check (true);
