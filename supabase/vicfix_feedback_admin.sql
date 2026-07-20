-- =====================================================================
-- The Vic Fix — feedback: admin (dashboard) access
-- Lets the signed-in admin READ and MODERATE feedback from the /admin
-- Collective → Feedback sub-tab. Mirrors the dj_collective_rsvps admin
-- pattern: RLS policies for the `authenticated` role + base-table grants.
-- Run this AFTER vicfix_feedback.sql, in the Supabase SQL editor.
--
-- The public still can't touch these tables (no anon policies). Only the
-- edge function (service_role) writes, and only the signed-in admin reads.
-- =====================================================================

-- event_feedback: admin reads everything, and updates status (approve/reject).
drop policy if exists feedback_admin_select on public.event_feedback;
create policy feedback_admin_select on public.event_feedback
  for select to authenticated using (true);

drop policy if exists feedback_admin_update on public.event_feedback;
create policy feedback_admin_update on public.event_feedback
  for update to authenticated using (true) with check (true);

grant select, update on public.event_feedback to authenticated;

-- banned_identifiers: admin can view, add, and lift bans from the dashboard.
drop policy if exists bans_admin_all on public.banned_identifiers;
create policy bans_admin_all on public.banned_identifiers
  for all to authenticated using (true) with check (true);

grant select, insert, delete on public.banned_identifiers to authenticated;

notify pgrst, 'reload schema';
