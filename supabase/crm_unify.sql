-- ============================================================
-- CRM UNIFICATION ENGINE  (additive — source tables untouched)
-- contacts master + consent-scoped relationships + plain-English
-- display layer + server-computed segments. Idempotent: re-runnable.
-- RUN in the Supabase SQL editor (or via Management API).
-- ============================================================

-- ---------- normalisers ----------
create or replace function crm_norm_phone(p text) returns text language sql immutable as $$
  select case when p is null then null else (
    select case
      when length(d) = 10                       then '+91' || d
      when length(d) = 12 and left(d,2) = '91'  then '+'   || d
      when length(d) = 11 and left(d,1) = '0'   then '+91' || right(d,10)
      when length(d) between 11 and 15          then '+'   || d
      else null
    end from (select regexp_replace(p,'[^0-9]','','g') d) x
  ) end
$$;

-- trim, collapse whitespace, drop adjacent duplicate words, Title Case
create or replace function crm_norm_name(n text) returns text language sql immutable as $$
  select nullif(initcap(regexp_replace(
           regexp_replace(lower(trim(coalesce(n,''))), '\s+', ' ', 'g'),
           '(\y[a-z]+\y)\s+\1', '\1', 'g')), '')
$$;

create or replace function crm_plain_status(s text) returns text language sql immutable as $$
  select case lower(coalesce(s,''))
    when 'pending'  then 'awaiting reply'
    when 'accepted' then 'confirmed'
    when 'declined' then 'passed'
    else coalesce(nullif(s,''),'enquiry') end
$$;

-- ---------- master tables ----------
create table if not exists contacts (
  id         uuid primary key default gen_random_uuid(),
  name       text,
  phone      text,                 -- E.164, primary dedupe key
  email      text,                 -- lowercased, secondary dedupe key
  instagram  text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists contacts_phone_uidx on contacts(phone) where phone is not null;

create table if not exists contact_relationships (
  id         uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id) on delete cascade,
  kind       text not null check (kind in ('club_guest','lead','client','podcast','subscriber')),
  source     text,                 -- web_booking/manual_whatsapp/manual_phone/referral/rsvp/podcast_form/instagram/resend_import
  ref_table  text not null,
  ref_id     uuid not null,
  meta       jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (ref_table, ref_id)       -- one relationship per source row (kind may change, e.g. lead->client)
);
create index if not exists cr_contact_idx on contact_relationships(contact_id);
create index if not exists cr_kind_idx    on contact_relationships(kind);

-- ---------- dedupe resolver (phone, then email; enrich on match) ----------
create or replace function crm_get_contact(p_name text, p_phone text, p_email text, p_ig text) returns uuid
language plpgsql as $$
declare
  v_phone text := crm_norm_phone(p_phone);
  v_email text := lower(nullif(trim(coalesce(p_email,'')),''));
  v_name  text := crm_norm_name(p_name);
  v_id    uuid;
begin
  if v_phone is not null then select id into v_id from contacts where phone = v_phone limit 1; end if;
  if v_id is null and v_email is not null then select id into v_id from contacts where email = v_email limit 1; end if;
  if v_id is null then
    insert into contacts(name, phone, email, instagram)
    values (v_name, v_phone, v_email, nullif(p_ig,'')) returning id into v_id;
  else
    update contacts set
      name      = case when length(coalesce(v_name,'')) > length(coalesce(name,'')) then v_name else name end,
      phone     = coalesce(phone, v_phone),
      email     = coalesce(email, v_email),
      instagram = coalesce(instagram, nullif(p_ig,'')),
      updated_at = now()
    where id = v_id;
  end if;
  return v_id;
end $$;

-- ---------- idempotent backfill / ongoing sync ----------
create or replace function crm_resync() returns void language plpgsql as $$
declare r record; cid uuid;
begin
  for r in select * from event_rsvps loop
    cid := crm_get_contact(r.name, r.phone, null, r.instagram);
    insert into contact_relationships(contact_id, kind, source, ref_table, ref_id, meta, created_at)
    values (cid,'club_guest', coalesce(nullif(r.source,''),'rsvp'),'event_rsvps', r.id,
            jsonb_build_object('event_slug', r.event, 'guests', r.guests), r.created_at)
    on conflict (ref_table, ref_id) do update set contact_id=excluded.contact_id, kind=excluded.kind, source=excluded.source, meta=excluded.meta;
  end loop;

  for r in select * from bookings loop
    cid := crm_get_contact(r.name, r.contact, r.client_email, null);
    insert into contact_relationships(contact_id, kind, source, ref_table, ref_id, meta, created_at)
    values (cid, case when r.status='accepted' then 'client' else 'lead' end,
            case r.source when 'funnel' then 'web_booking' when 'manual' then 'manual_whatsapp' else coalesce(nullif(r.source,''),'web_booking') end,
            'bookings', r.id,
            jsonb_build_object('event_type', r.event_type, 'event_date', r.event_date, 'status', r.status, 'fee', r.agreed_fee, 'venue', r.venue, 'city', r.city), r.created_at)
    on conflict (ref_table, ref_id) do update set contact_id=excluded.contact_id, kind=excluded.kind, source=excluded.source, meta=excluded.meta;
  end loop;

  for r in select * from podcast_applications loop
    cid := crm_get_contact(r.name, r.phone, r.email, r.instagram);
    insert into contact_relationships(contact_id, kind, source, ref_table, ref_id, meta, created_at)
    values (cid,'podcast','podcast_form','podcast_applications', r.id,
            jsonb_build_object('role', r.role), r.created_at)
    on conflict (ref_table, ref_id) do update set contact_id=excluded.contact_id, kind=excluded.kind, meta=excluded.meta;
  end loop;

  -- subscriber mirror: only ACTIVE Resend subscribers earn the relationship
  for r in select * from subscribers where status='active' loop
    cid := crm_get_contact(r.name, null, r.email, null);
    insert into contact_relationships(contact_id, kind, source, ref_table, ref_id, meta, created_at)
    values (cid,'subscriber','resend_import','subscribers', r.id,
            jsonb_build_object('status', r.status,'list', r.list,'sub_source', r.source,'subscribed_at', r.subscribed_at), r.subscribed_at)
    on conflict (ref_table, ref_id) do update set contact_id=excluded.contact_id, meta=excluded.meta;
  end loop;
  -- drop subscriber relationships that are no longer active in Resend mirror (consent stays accurate)
  delete from contact_relationships cr where cr.kind='subscriber'
    and not exists (select 1 from subscribers s where s.id = cr.ref_id and s.status='active');
end $$;

-- ---------- plain-English display line (top-precedence relationship) ----------
create or replace function crm_display_line(cid uuid) returns text language plpgsql stable as $$
declare topk text; m jsonb; n int; evt text; dl text;
begin
  select cr.kind, cr.meta into topk, m
  from contact_relationships cr
  join (values ('client',1),('lead',2),('club_guest',3),('podcast',4),('subscriber',5)) p(k,prec) on p.k=cr.kind
  where cr.contact_id=cid order by p.prec, cr.created_at desc limit 1;
  if topk is null then return null; end if;

  if topk='client' then
    return 'Booked: ' || coalesce(nullif(m->>'event_type',''),'event')
      || coalesce(' · ' || to_char((m->>'event_date')::date,'DD Mon YYYY'),'')
      || case when (m->>'fee') is not null then ' · ₹' || trim(to_char((m->>'fee')::numeric,'FM9G999G999G999')) else '' end;
  elsif topk='lead' then
    return 'Enquired: ' || coalesce(nullif(m->>'event_type',''),'event')
      || coalesce(', ' || to_char((m->>'event_date')::date,'Mon'),'')
      || ' · ' || crm_plain_status(m->>'status');
  elsif topk='club_guest' then
    select count(*) into n from contact_relationships where contact_id=cid and kind='club_guest';
    if n > 1 then return 'Came to ' || n || ' nights'; end if;
    select coalesce(nullif(e.title,''), m->>'event_slug'), e.date_label into evt, dl from events e where e.slug = m->>'event_slug';
    return 'Came to ' || coalesce(evt,'an event') || coalesce(' · ' || nullif(dl,''),'');
  elsif topk='podcast' then
    select to_char(created_at,'DD Mon YYYY') into dl from contact_relationships where contact_id=cid and kind='podcast' order by created_at limit 1;
    return 'Applied for The VIC Fix · ' || dl;
  else -- subscriber
    return 'Subscribed' || coalesce(' · ' || to_char((m->>'subscribed_at')::timestamptz,'DD Mon YYYY'),'');
  end if;
end $$;

-- ---------- display view: Name -> label (relationship-first) -> line ----------
create or replace view v_contacts as
select c.id, c.name, c.phone, c.email, c.instagram, c.created_at,
  (select string_agg(w.word, ' + ' order by w.prec)
     from (select distinct cr.kind from contact_relationships cr where cr.contact_id=c.id) k
     join (values ('client',1,'Client'),('lead',2,'Lead'),('club_guest',3,'Club Guest'),('podcast',4,'Podcast'),('subscriber',5,'Newsletter')) w(kind,prec,word)
       on w.kind=k.kind) as display_label,
  crm_display_line(c.id) as display_line,
  array(select distinct kind from contact_relationships where contact_id=c.id order by 1) as kinds
from contacts c;

-- ---------- Phase 3 segments (server-computed; display-formatted) ----------
create or replace view seg_repeat_guests as            -- RSVP >=2 and NOT a client
  select v.* from v_contacts v
  where (select count(*) from contact_relationships r where r.contact_id=v.id and r.kind='club_guest') >= 2
    and not exists (select 1 from contact_relationships r where r.contact_id=v.id and r.kind='client');

create or replace view seg_past_clients as
  select v.* from v_contacts v
  where exists (select 1 from contact_relationships r where r.contact_id=v.id and r.kind='client');

create or replace view seg_invite_candidates as        -- guests/clients NOT subscribers (manual invite only)
  select v.* from v_contacts v
  where exists (select 1 from contact_relationships r where r.contact_id=v.id and r.kind in ('club_guest','client'))
    and not exists (select 1 from contact_relationships r where r.contact_id=v.id and r.kind='subscriber');

create or replace view seg_unpaid_soon as              -- unpaid accepted bookings within 14 days
  select v.*, b.event_date, b.agreed_fee,
         coalesce(b.agreed_fee,0) - coalesce((select sum(amount) from gig_payments gp where gp.booking_id=b.id),0) as balance
  from v_contacts v
  join contact_relationships r on r.contact_id=v.id and r.kind='client'
  join bookings b on b.id = r.ref_id
  where b.status='accepted' and b.event_date between current_date and current_date + 14
    and coalesce(b.agreed_fee,0) - coalesce((select sum(amount) from gig_payments gp where gp.booking_id=b.id),0) > 0;

create or replace function seg_stale_leads(days int default 7) returns setof v_contacts language sql stable as $$
  select v.* from v_contacts v
  where exists (select 1 from contact_relationships r where r.contact_id=v.id and r.kind='lead'
    and coalesce(r.meta->>'status','pending')='pending' and r.created_at < now() - make_interval(days => days));
$$;

-- ---------- keep unified going forward ----------
create or replace function crm_sync_trigger() returns trigger language plpgsql as $$
begin perform crm_resync(); return null; end $$;
drop trigger if exists trg_crm_bookings on bookings;
create trigger trg_crm_bookings after insert or update or delete on bookings for each statement execute function crm_sync_trigger();
drop trigger if exists trg_crm_rsvps on event_rsvps;
create trigger trg_crm_rsvps after insert or update or delete on event_rsvps for each statement execute function crm_sync_trigger();
drop trigger if exists trg_crm_podcast on podcast_applications;
create trigger trg_crm_podcast after insert or update or delete on podcast_applications for each statement execute function crm_sync_trigger();
drop trigger if exists trg_crm_subs on subscribers;
create trigger trg_crm_subs after insert or update or delete on subscribers for each statement execute function crm_sync_trigger();

-- ---------- RLS + grants (admin-only; no anon) ----------
alter table contacts enable row level security;
alter table contact_relationships enable row level security;
drop policy if exists "admin contacts" on contacts;
create policy "admin contacts" on contacts for select to authenticated using (true);
drop policy if exists "admin rels" on contact_relationships;
create policy "admin rels" on contact_relationships for select to authenticated using (true);
grant select on contacts, contact_relationships, v_contacts, seg_repeat_guests, seg_past_clients, seg_invite_candidates, seg_unpaid_soon to authenticated;
grant execute on function seg_stale_leads(int) to authenticated;

-- ---------- initial backfill ----------
select crm_resync();
