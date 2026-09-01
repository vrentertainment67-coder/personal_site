-- ============================================================================
-- /book/ conversion fix — make the event date OPTIONAL and allow the WEDDING type
-- Run in Supabase → SQL Editor. Two independent parts.
-- After BOTH are done, set `dbMigrated = true` in src/components/BookingApp.jsx
-- (one line, ~185) so the client drops its stopgaps and writes clean data.
-- ============================================================================

-- PART 1 — make event_date optional (safe, exact) ---------------------------
-- The booking funnel now lets a lead enquire WITHOUT locking a date (the #1
-- reason the old form converted zero: if their date was booked/on-hold the
-- calendar disabled it and they couldn't submit at all). The column is NOT NULL
-- today, so a date-less submit throws 23502. Drop the constraint:
alter table public.bookings alter column event_date drop not null;

-- vic_blocked_dates() already filters `event_date is not null`, so date-less
-- enquiries correctly DON'T appear as blocked days on the public calendar.

-- PART 2 — allow the "wedding" event type in submit_booking ------------------
-- The bookings.event_type CHECK already allows 'wedding' (see bookings_admin.sql),
-- but the submit_booking() RPC has its OWN stricter whitelist that rejects it
-- (P0001 "Invalid event type."). That whitelist lives only in the DB, not in
-- this repo, so I can't edit it blind without clobbering the rest of the function
-- (rate-limit guard, insert, notify, etc.).
--
-- >>> To finish this cleanly: open Supabase → Database → Functions → submit_booking,
-- >>> copy the whole definition, and paste it back to me. I'll return the exact
-- >>> one-line whitelist edit (add 'wedding') so nothing else changes.
--
-- Until then the client sends Wedding leads as event_type 'other' with
-- "Event type: Wedding" tagged into the message, so no wedding enquiry is lost.
