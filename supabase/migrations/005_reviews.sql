-- Only an authenticated purchaser can submit one review per product/order.
create unique index reviews_order_product on public.reviews(order_id,product_id) where order_id is not null;
create function public.submit_review(actor_id uuid, product text, reviewer text, stars integer, review_body text) returns uuid language plpgsql security definer set search_path='' as $$
declare purchase uuid; result uuid;
begin
 if actor_id is null then raise exception 'Please sign in to review your purchase.';end if;
 if not coalesce((select (value->>'reviewSubmissions')::boolean from public.settings where key='operations'),false) then raise exception 'Reviews are currently closed.';end if;
 if stars not between 1 and 5 or length(trim(reviewer)) not between 2 and 100 or length(trim(review_body)) not between 10 and 2000 then raise exception 'Check your review details.';end if;
 select o.id into purchase from public.orders o join public.order_items i on i.order_id=o.id where o.user_id=actor_id and o.status='completed' and i.snapshot->>'productId'=product order by o.created_at desc limit 1;
 if purchase is null then raise exception 'You can review this sweet after your signed-in order is completed.';end if;
 insert into public.reviews(product_id,order_id,name,rating,body,verified,published) values(product,purchase,trim(reviewer),stars,trim(review_body),true,false) returning id into result;
 return result;
exception when unique_violation then raise exception 'You already reviewed this sweet from your latest order.';
end $$;
revoke all on function public.submit_review(uuid,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.submit_review(uuid,text,text,integer,text) to service_role;
