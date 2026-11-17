-- Aggregate only published reviews for requested products in one bounded query.
create function public.product_rating_summary(product_ids jsonb) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_object_agg(product_id, summary),'{}'::jsonb) from (
   select product_id, jsonb_build_object('ratingCount',count(*),'ratingAverage',round(avg(rating),1)) summary
   from public.reviews
   where published and product_id in (select jsonb_array_elements_text(product_ids))
   group by product_id
 ) r;
$$;
revoke all on function public.product_rating_summary(jsonb) from public,anon,authenticated;
grant execute on function public.product_rating_summary(jsonb) to service_role;
