-- Chamatkar — lucky-draw READ access over the existing check-in list.
--
-- Registration already exists: /chamatkar/checkin writes guests to event_rsvps
-- (event = 'chamatkar-vol5', name/phone/instagram). anon can INSERT there but
-- NOT SELECT (RLS), so the draw + TV screen read the pool through this one
-- token-gated SECURITY DEFINER function. Winners are tracked on the host device
-- (client-side) and broadcast to the screen over Realtime — no schema change to
-- the shared event_rsvps table. Run in the Supabase SQL editor.

-- Host access token → which event's list it unlocks. Locked table.
create table if not exists public.chamatkar_access (
  token      text primary key,
  event      text not null,
  label      text,
  created_at timestamptz not null default now()
);
alter table public.chamatkar_access enable row level security;
revoke all on public.chamatkar_access from anon, authenticated, public;

-- The draw pool: everyone checked in for the token's event, one row per phone
-- (dedupe against double check-ins), oldest first. Only name + instagram +
-- last-4 of the phone leave the database — enough to draw and call out a winner.
create or replace function public.chamatkar_draw_list(p_token text)
returns table (id text, name text, instagram text, phone_last4 text)
language plpgsql security definer set search_path = public as $$
declare v_event text;
begin
  select event into v_event from chamatkar_access where token = p_token;
  if v_event is null then return; end if;            -- bad/absent token → empty
  return query
    select t.id, t.name, t.instagram, t.phone_last4 from (
      select distinct on (regexp_replace(coalesce(r.phone, ''), '\D', '', 'g'))
             r.id::text as id, r.name, r.instagram,
             right(regexp_replace(coalesce(r.phone, ''), '\D', '', 'g'), 4) as phone_last4,
             r.created_at
      from public.event_rsvps r
      where coalesce(r.event, '') = v_event
      order by regexp_replace(coalesce(r.phone, ''), '\D', '', 'g'), r.created_at
    ) t
    order by t.created_at;
end;
$$;
revoke all on function public.chamatkar_draw_list(text) from public;
grant execute on function public.chamatkar_draw_list(text) to anon, authenticated;

-- The event's host token. Rotate by inserting a new row (and handing out the new
-- links); delete this one to kill the old links. `event` MUST match the current
-- EVENT_SLUG in /chamatkar/checkin (chamatkar-vol5 today).
insert into public.chamatkar_access (token, event, label)
values ('eff4242c17e10927ca31f89b5dbf2061efe4748d', 'chamatkar-vol5', 'Chamatkar Vol.5 draw')
on conflict (token) do update set event = excluded.event, label = excluded.label;

-- Isolated test token → a throwaway 'chamatkar-test' event, so the draw can be
-- verified end-to-end without touching the real list. Delete it after testing:
--   delete from public.chamatkar_access where event = 'chamatkar-test';
--   delete from public.event_rsvps where event = 'chamatkar-test';
insert into public.chamatkar_access (token, event, label)
values ('91f9b0bba23c2bd2710aaa99e9840bf28b446741', 'chamatkar-test', 'Chamatkar TEST')
on conflict (token) do update set event = excluded.event, label = excluded.label;
