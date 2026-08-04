-- ============================================================
-- Remix-download opt-in → unified contacts master
-- Extends the EXISTING public.contacts table (already holds
-- name/phone/email/instagram) with the marketing-consent fields the
-- remix download opt-in writes. Insert-only for anon by design: the
-- publishable key can add a contact but never read the list back.
-- Run once. Idempotent.
-- ============================================================

alter table public.contacts
  add column if not exists source            text,
  add column if not exists source_ref        text,
  add column if not exists consent_marketing boolean default false,
  add column if not exists consented_at      timestamptz;

-- Unique email so the master never accumulates duplicate contacts. A repeat
-- sign-up hits this constraint and returns 409, which the opt-in form treats
-- as success ("already on the list"). The client does a PLAIN insert (not an
-- upsert), so anon needs only INSERT — no SELECT/UPDATE — staying insert-only.
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.contacts'::regclass and conname = 'contacts_email_key'
  ) then
    alter table public.contacts add constraint contacts_email_key unique (email);
  end if;
end $$;

-- Anonymous visitors may add themselves and nothing else.
grant insert on public.contacts to anon;
drop policy if exists "public insert only" on public.contacts;
create policy "public insert only"
  on public.contacts for insert
  to anon
  with check (true);

-- No select/update/delete policy for anon: the key writes, never reads.
