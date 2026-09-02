-- ============================================================================
-- /book/ conversion fix — make the event date OPTIONAL and allow the WEDDING type
-- Run in Supabase → SQL Editor. Two independent parts.
-- After BOTH are done, set `dbMigrated = true` in src/components/BookingApp.jsx
-- (one line, ~185) so the client drops its stopgaps and writes clean data.
-- ============================================================================

-- PART 1 — make event_date optional  ✅ DONE 2026-09-02 -----------------------
-- The booking funnel now lets a lead enquire WITHOUT locking a date (the #1
-- reason the old form converted zero: if their date was booked/on-hold the
-- calendar disabled it and they couldn't submit at all). The column is NOT NULL
-- today, so a date-less submit throws 23502. Drop the constraint:
alter table public.bookings alter column event_date drop not null;

-- vic_blocked_dates() already filters `event_date is not null`, so date-less
-- enquiries correctly DON'T appear as blocked days on the public calendar.

-- PART 2 — widen submit_booking's event-type whitelist ----------------------
-- The old RPC only accepted ('sangeet','nightlife','private','festival') — so
-- wedding, corporate AND other were ALL rejected ("Invalid event type."), even
-- though the bookings.event_type CHECK allows the full set. This recreates the
-- function with the whitelist matched to that CHECK, and makes the date checks
-- null-safe (event_date is now optional). Everything else is byte-for-byte the
-- original. Run once; then flip weddingMigrated=true in BookingApp.jsx.
CREATE OR REPLACE FUNCTION public.submit_booking(p_name text, p_contact text, p_event_type text, p_event_date date, p_venue text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_budget text DEFAULT NULL::text, p_message text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  new_id uuid;
begin
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_contact), '') = '' then
    raise exception 'Name and contact are required.';
  end if;

  if p_event_type not in ('sangeet','wedding','nightlife','private','festival','corporate','dj class','training','other') then
    raise exception 'Invalid event type.';
  end if;

  -- date is optional now; only validate/gate when one was actually given
  if p_event_date is not null and p_event_date < current_date then
    raise exception 'That date has already passed.';
  end if;

  if p_event_date is not null and (exists (
        select 1 from public.bookings
         where event_date = p_event_date and status = 'accepted'
      ) or exists (
        select 1 from public.availability_blocks
         where block_date = p_event_date
      )) then
    raise exception 'That date is no longer available.';
  end if;

  insert into public.bookings (name, contact, event_type, event_date, venue, city, budget, message, status)
  values (p_name, p_contact, p_event_type, p_event_date, p_venue, p_city, p_budget, p_message, 'pending')
  returning id into new_id;

  return new_id;
end;
$function$;
