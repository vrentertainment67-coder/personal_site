-- ============================================================
-- DJ VIC — booking spam / rate limit (server-side, catches direct RPC abuse)
-- A BEFORE INSERT trigger on bookings, so it applies no matter how the row is
-- created (form, submit_booking RPC, or a bot calling the API directly).
-- RUN ONCE in the Supabase SQL editor. Tune the numbers to taste.
-- ============================================================
create or replace function public.booking_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Global burst cap: no more than 8 new requests in any 10-minute window.
  if (select count(*) from bookings where created_at > now() - interval '10 minutes') >= 8 then
    raise exception 'Too many booking requests right now. Please try again in a few minutes.';
  end if;

  -- Per-contact cap: at most 3 outstanding pending requests from the same contact.
  if new.contact is not null
     and (select count(*) from bookings where contact = new.contact and status = 'pending') >= 3 then
    raise exception 'You already have pending requests — we''ll be in touch shortly.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_booking_rate on public.bookings;
create trigger trg_booking_rate
  before insert on public.bookings
  for each row execute function public.booking_rate_limit();
