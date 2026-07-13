-- ── The DJ Collective landing page: public aggregate stats + email capture ──
-- Both are SECURITY DEFINER so the public (anon) page can call them without
-- exposing any RSVP row / PII. Stats return only counts.

-- Aggregate stats for the "room so far" section (no PII). p_session null = all editions.
create or replace function public.dj_collective_stats(p_session text default null)
returns json language sql security definer set search_path = public, pg_temp stable as $$
  with base as (
    select * from public.dj_collective_rsvps where (p_session is null or session = p_session)
  ),
  genre_rows as (
    select trim(g) as label
    from base, regexp_split_to_table(coalesce(genre, ''), '\s*,\s*') as g
    where trim(g) <> ''
  ),
  genre_agg as (
    select label, count(*)::int as count from genre_rows group by label order by count(*) desc limit 8
  ),
  exp_order(label, ord) as (
    values ('Under 2 years', 1), ('2-5 years', 2), ('5-10 years', 3), ('10-15 years', 4), ('15+ years', 5)
  ),
  exp_agg as (
    select o.label, o.ord, count(b.id)::int as count
    from exp_order o left join base b on b.years = o.label
    group by o.label, o.ord having count(b.id) > 0
  )
  select json_build_object(
    'total', (select count(*)::int from base),
    'genre_count', (select count(distinct label)::int from genre_rows),
    'genres', coalesce((select json_agg(json_build_object('label', label, 'count', count)) from genre_agg), '[]'::json),
    'experience', coalesce((select json_agg(json_build_object('label', label, 'count', count) order by ord) from exp_agg), '[]'::json)
  );
$$;
grant execute on function public.dj_collective_stats(text) to anon, authenticated;

-- Owned-audience email capture from the landing page's "can't make this one" field.
create or replace function public.dj_collective_subscribe(p_email text)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare v_email text := lower(nullif(trim(p_email), ''));
begin
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return json_build_object('status', 'error');
  end if;
  insert into public.subscribers (email, source) values (v_email, 'dj-collective')
  on conflict (email) do nothing;
  return json_build_object('status', 'ok');
end;
$$;
grant execute on function public.dj_collective_subscribe(text) to anon, authenticated;

notify pgrst, 'reload schema';
