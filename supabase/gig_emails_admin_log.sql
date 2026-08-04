-- ============================================================
-- Let the admin (authenticated) record each sent email itself, so the
-- Outbox/Sent view is reliable even though the edge function's service-role
-- logging isn't landing. Adds a subject line for a readable list. Run once.
-- ============================================================

alter table public.gig_emails add column if not exists subject text;

grant insert on public.gig_emails to authenticated;

drop policy if exists "admin writes gig_emails" on public.gig_emails;
create policy "admin writes gig_emails"
  on public.gig_emails for insert
  to authenticated
  with check (true);

-- (SELECT for authenticated already exists via "admin reads gig_emails".)
