create index reviews_public_page on public.reviews(product_id,created_at desc,id desc) where published;
create function public.review_page(product text, before_at timestamptz default null, before_id uuid default null)
returns jsonb language sql stable security definer set search_path='' as $$
 with selected as (
  select id,name,rating,body,created_at,verified from public.reviews
  where product_id=product and published
    and (before_at is null or (created_at,id)<(before_at,before_id))
  order by created_at desc,id desc limit 21
 ), page as (select * from selected order by created_at desc,id desc limit 20)
 select jsonb_build_object(
  'items',coalesce((select jsonb_agg(p order by created_at desc,id desc) from page p),'[]'::jsonb),
  'nextCursor',case when (select count(*) from selected)>20 then
    (select jsonb_build_object('createdAt',created_at,'id',id) from page order by created_at,id limit 1)
    else null end
 );
$$;
revoke all on function public.review_page(text,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.review_page(text,timestamptz,uuid) to service_role;
