-- ============================================================
-- DJ VIC — WhatsApp Business (Cloud API) automation for the Chamatkar
-- post-event follow-up. Builds on event_followup.sql (which added the
-- lifecycle columns the manual flow already uses). This only adds the
-- few extras the *automated* flow needs: the inbound reply text, where
-- the experience came from, the opt-in timestamp, and a send/delivery log.
--
-- Idempotent — safe to re-run. Run in the Supabase SQL editor.
-- Requires event_followup.sql to have been run first.
-- ============================================================

alter table public.event_rsvps
  add column if not exists reply_text        text,        -- last inbound WhatsApp reply (verbatim)
  add column if not exists experience_source text,        -- 'reply' | 'manual' | 'checkin'
  add column if not exists wa_opt_in_at       timestamptz; -- when consent_followup was captured

-- ── Outbound / inbound message log ──────────────────────────
-- One row per Cloud API send (and per delivery-status callback update).
-- Lets the admin see what actually went out and whether it delivered,
-- and gives the cron an audit trail. Written by the edge functions with
-- the service role; only the logged-in admin can read it.
create table if not exists public.wa_messages (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  rsvp_id      uuid references public.event_rsvps(id) on delete set null,
  event        text,
  phone        text,
  direction    text not null default 'out',   -- 'out' | 'in'
  stage        text,                           -- 'reminder' | 'step1' | 'review' | 'recovery'
  template     text,                           -- template name used (out)
  wa_message_id text,                          -- Meta's message id (for status matching)
  status       text,                           -- 'sent' | 'delivered' | 'read' | 'failed'
  body         text,                           -- inbound text / outbound preview
  detail       text                            -- error payload, etc.
);

create index if not exists wa_messages_rsvp_idx on public.wa_messages (rsvp_id, created_at desc);
create index if not exists wa_messages_waid_idx on public.wa_messages (wa_message_id);

alter table public.wa_messages enable row level security;

drop policy if exists "wa_messages_admin_read" on public.wa_messages;
create policy "wa_messages_admin_read" on public.wa_messages
  for select to authenticated using (true);
grant select on public.wa_messages to authenticated;
-- Inserts/updates come from the edge functions via the service role,
-- which bypasses RLS — no anon/authenticated write grant needed.

notify pgrst, 'reload schema';
