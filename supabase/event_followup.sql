-- ============================================================
-- DJ VIC — Chamatkar post-event follow-up & review flow
-- Extends `event_rsvps` with a per-guest lifecycle so the admin can run
-- the two-step follow-up (experience check → review ask / recovery) from
-- the /admin Guest List "Follow-up" tab. Everything is keyed by the event
-- slug already on each RSVP, so the flow re-runs cleanly per edition.
--
-- The channel is the same click-to-chat WhatsApp the rest of the guest
-- list uses (wa.me deep links — VIC taps send). These columns just track
-- WHERE each guest is in the flow so we never double-ask and only ever
-- request a review from someone who had a good time.
--
-- Idempotent — safe to re-run. Run in the Supabase SQL editor.
-- ============================================================

-- ── Per-RSVP lifecycle ──────────────────────────────────────
alter table public.event_rsvps
  add column if not exists attended            boolean,            -- true | false | null (unknown)
  add column if not exists experience          text,               -- 'positive' | 'negative' | 'no_show' | 'unknown' | null
  add column if not exists consent_followup    boolean not null default true,  -- soft opt-in via the RSVP
  add column if not exists opted_out           boolean not null default false, -- honour STOP / "don't message me"
  add column if not exists reminder_sent_at    timestamptz,        -- pre-event reminder (optional)
  add column if not exists followup1_sent_at   timestamptz,        -- Step 1: experience check
  add column if not exists followup2_sent_at   timestamptz,        -- Step 2: review ask OR recovery
  add column if not exists review_requested_at timestamptz,        -- Step 2a fired
  add column if not exists review_completed    boolean not null default false, -- best-effort, admin-marked
  add column if not exists last_message_at     timestamptz;        -- most recent outbound touch

-- ── Admin UPDATE (event_rsvps had insert / select / delete only) ──
-- The follow-up flow writes lifecycle state back onto each row, so the
-- logged-in admin needs UPDATE — both an RLS policy AND the base grant
-- (a policy alone still 42501s under PostgREST).
drop policy if exists "rsvp_admin_update" on public.event_rsvps;
create policy "rsvp_admin_update" on public.event_rsvps
  for update to authenticated
  using (true) with check (true);
grant update on public.event_rsvps to authenticated;

-- ── Configurable review link per edition ────────────────────
-- Single swappable destination for the Step 2a review ask (recommend the
-- Google Business review short-link for SEO value). Stored on the event so
-- each edition can point somewhere different; the admin sets it once in the
-- Follow-up tab. NULL until set — the review ask stays disabled until it is.
alter table public.events
  add column if not exists review_link text;

-- Seed the DJ VIC Google Business review link as the default for every
-- existing edition (only where unset, so a per-edition override sticks).
-- New editions cloned from an existing one inherit it automatically.
update public.events
  set review_link = 'https://g.page/r/CZKKtBcBFJH4EAE/review'
  where review_link is null;

notify pgrst, 'reload schema';
