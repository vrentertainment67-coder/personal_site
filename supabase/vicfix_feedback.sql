-- =====================================================================
-- The Vic Fix — anonymous event feedback
-- Supabase schema: tables + RLS
-- Run this in the Supabase SQL editor (or via migration).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Feedback submissions
-- ---------------------------------------------------------------------
create table if not exists public.event_feedback (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  event_slug     text not null default 'dj-meet-2026',
  category       text not null default 'feedback'
                 check (category in ('feedback','idea','question','other')),
  message        text not null check (char_length(message) between 1 and 2000),
  -- abuse-control metadata (honestly disclosed on the form):
  fingerprint    text,            -- client-side visitorId (probabilistic)
  ip_hash        text,            -- SHA-256(ip + salt), computed server-side
  user_agent     text,
  -- moderation:
  status         text not null default 'pending'
                 check (status in ('pending','approved','rejected')),
  flagged        boolean not null default false,
  flag_reason    text,
  moderation_note text
);

create index if not exists event_feedback_status_idx      on public.event_feedback (status, created_at desc);
create index if not exists event_feedback_fingerprint_idx on public.event_feedback (fingerprint);
create index if not exists event_feedback_event_idx       on public.event_feedback (event_slug, created_at desc);

-- ---------------------------------------------------------------------
-- 2. Ban list (the "silent ban" mechanism)
--    A banned fingerprint/ip still gets a success response at the form,
--    but their submission is stored as 'rejected' and never surfaces.
-- ---------------------------------------------------------------------
create table if not exists public.banned_identifiers (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  fingerprint text,
  ip_hash     text,
  reason      text
);

create index if not exists banned_fingerprint_idx on public.banned_identifiers (fingerprint);
create index if not exists banned_iphash_idx      on public.banned_identifiers (ip_hash);

-- ---------------------------------------------------------------------
-- 3. Row Level Security
--    Lock EVERYTHING. No anon reads, no anon writes.
--    The public never touches these tables directly — all writes go
--    through the submit-feedback edge function (service_role), and all
--    reads happen in your admin dashboard (service_role / authenticated).
-- ---------------------------------------------------------------------
alter table public.event_feedback     enable row level security;
alter table public.banned_identifiers enable row level security;

-- No policies for the anon role = anon can do nothing. That is intentional.
-- service_role bypasses RLS, so the edge function and your admin tools
-- keep full access. If you moderate from an authenticated dashboard user
-- instead of service_role, add read/update policies for that role only.

-- IMPORTANT: RLS-bypass is NOT a privilege grant. On this project the default
-- privileges do not auto-grant table access, so the edge function's
-- service_role writes fail silently without these. (This was the real bug that
-- made submissions vanish on first deploy.)
grant all on public.event_feedback     to service_role;
grant all on public.banned_identifiers to service_role;

-- ---------------------------------------------------------------------
-- 4. Convenience view for the moderation queue
-- ---------------------------------------------------------------------
create or replace view public.feedback_queue with (security_invoker = true) as
select id, created_at, event_slug, category, message, flagged, flag_reason, status
from public.event_feedback
where status = 'pending'
order by flagged desc, created_at asc;
