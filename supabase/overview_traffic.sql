-- ============================================================
-- DJ VIC — Overview traffic stats RPC
-- One SECURITY DEFINER function (like visitor_stats) that returns top pages,
-- traffic sources, and /book funnel views for the admin Overview.
-- RUN ONCE in the Supabase SQL editor.
-- pageviews columns: path, referrer, visitor, ts (timestamp), id.
-- ============================================================
create or replace function public.overview_traffic(p_from date, p_to date)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'top_pages', (
      select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select path, count(*)::int as views
        from pageviews
        where ts::date between p_from and p_to
        group by path
        order by count(*) desc
        limit 8
      ) t
    ),
    'top_sources', (
      select coalesce(jsonb_agg(s), '[]'::jsonb) from (
        select
          case
            when referrer is null or referrer = '' then 'Direct'
            when referrer ilike '%instagram%' then 'Instagram'
            when referrer ilike '%google%'    then 'Google'
            when referrer ilike '%wa.me%' or referrer ilike '%whatsapp%' then 'WhatsApp'
            when referrer ilike '%facebook%' or referrer ilike '%fb.%'   then 'Facebook'
            when referrer ilike '%youtube%'   then 'YouTube'
            when referrer ilike '%t.co%' or referrer ilike '%twitter%' or referrer ilike '%x.com%' then 'X / Twitter'
            else 'Other'
          end as source,
          count(*)::int as views
        from pageviews
        where ts::date between p_from and p_to
          and (referrer is null or referrer not ilike '%djvicofficial%')  -- ignore internal nav
        group by 1
        order by 2 desc
      ) s
    ),
    'book_views', (
      select count(*)::int from pageviews
      where ts::date between p_from and p_to
        and path in ('/book', '/book/')
    )
  );
$$;

grant execute on function public.overview_traffic(date, date) to authenticated;
