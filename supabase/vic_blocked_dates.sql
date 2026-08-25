-- ============================================================
-- Public availability feed for /events/ (the client-facing calendar).
--
-- Returns ONLY the dates VIC is booked on (accepted gigs) — never a name,
-- venue, fee, or any other client detail. SECURITY DEFINER lets it read the
-- RLS-locked `bookings` table, but it selects dates alone, so nothing private
-- is ever exposed to the public anon role. Multi-day gigs (event_end_date)
-- expand to every day in the range. Past dates are excluded.
--
-- Run once in the Supabase SQL editor. If your "confirmed" status isn't
-- 'accepted', change the WHERE clause to match (e.g. add 'confirmed').
-- ============================================================

create or replace function public.vic_blocked_dates()
returns table(d date)
language sql
security definer
stable
set search_path = public
as $$
  select distinct gs::date as d
  from public.bookings b
  cross join lateral generate_series(
    b.event_date,
    coalesce(b.event_end_date, b.event_date),
    interval '1 day'
  ) gs
  where b.status = 'accepted'
    and b.event_date is not null
    and coalesce(b.event_end_date, b.event_date) >= current_date;
$$;

-- Lock it down to a dates-only read for the public key.
revoke all on function public.vic_blocked_dates() from public;
grant execute on function public.vic_blocked_dates() to anon, authenticated;
