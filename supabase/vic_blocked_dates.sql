-- ============================================================
-- Public availability feed for /events/ (the client-facing calendar).
--
-- Returns ONLY the dates VIC is booked/held on — never a name, venue, fee, or
-- any client detail. Each date carries a `tentative` flag so the calendar can
-- mirror the admin:
--   • tentative = true  → the date has ONLY pending enquiries  (amber "On hold")
--   • tentative = false → at least one confirmed/completed gig  (red "Booked")
-- Declined enquiries are ignored. Multi-day gigs expand to every day. Past dates
-- are included so old bookings show too.
--
-- SECURITY DEFINER so it can read the RLS-locked `bookings` table, but it selects
-- dates + a flag only, so nothing private reaches the public anon role.
--
-- Run once in the Supabase SQL editor. (The return type changed, so it DROPs the
-- old version first — that's expected.)
-- ============================================================

drop function if exists public.vic_blocked_dates();

create function public.vic_blocked_dates()
returns table(d date, tentative boolean)
language sql
security definer
stable
set search_path = public
as $$
  select gs::date as d,
         bool_and(b.status = 'pending') as tentative
  from public.bookings b
  cross join lateral generate_series(
    b.event_date,
    coalesce(b.event_end_date, b.event_date),
    interval '1 day'
  ) gs
  where b.status in ('accepted', 'pending', 'completed')
    and b.event_date is not null
  group by gs::date;
$$;

revoke all on function public.vic_blocked_dates() from public;
grant execute on function public.vic_blocked_dates() to anon, authenticated;
