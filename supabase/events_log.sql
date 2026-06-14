-- ============================================================
-- DJ VIC — conversion event log (feeds the admin Insights tab)
-- Mirrors the GA4 events (generate_lead, whatsapp_click, tel_click,
-- email_click) into your own Supabase so the admin has real-time
-- conversion stats that no ad-blocker / GA 503 can hide.
-- Public can INSERT; only the logged-in admin can READ.
-- ============================================================

create table if not exists public.events_log (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null,        -- generate_lead | whatsapp_click | tel_click | email_click
  location    text,                 -- link_location / form_location (sticky_bar, footer, vicfix, book_page…)
  event_type  text,                 -- generate_lead's event_type (nightlife, podcast_guest, guest_list…)
  device      text,                 -- mobile | desktop
  path        text
);

alter table public.events_log enable row level security;

drop policy if exists "events_log_public_insert" on public.events_log;
create policy "events_log_public_insert" on public.events_log
  for insert to anon, authenticated with check (true);

drop policy if exists "events_log_admin_read" on public.events_log;
create policy "events_log_admin_read" on public.events_log
  for select to authenticated using (true);

grant insert on public.events_log to anon, authenticated;
grant select on public.events_log to authenticated;

create index if not exists events_log_created_idx on public.events_log (created_at desc);
create index if not exists events_log_name_idx on public.events_log (name);
