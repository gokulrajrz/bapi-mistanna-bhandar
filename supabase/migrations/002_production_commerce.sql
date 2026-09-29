-- Forward-only migration: preserves existing orders and catalogue data.
alter table public.product_variants add column sort_order integer not null default 0;
update public.product_variants set sort_order=coalesce(nullif(substring(id from '-([0-9]+)$'),''),'0')::integer;
alter table public.products add column created_at timestamptz not null default now();
alter table public.products add column search_document tsvector generated always as (to_tsvector('simple',coalesce(data->>'name','')||' '||coalesce(data->>'category','')||' '||coalesce(data->>'ingredients','')||' '||coalesce(data->>'tags',''))) stored;
create index products_search_idx on public.products using gin(search_document);
create index products_category_idx on public.products((data->>'category')) where active;
create index products_tags_idx on public.products using gin((data->'tags'));
create index variants_product_sort_idx on public.product_variants(product_id,sort_order,id);
alter table public.delivery_zones add column min_days integer not null default 1 check(min_days>=0);
alter table public.delivery_zones add column max_days integer not null default 3 check(max_days>=min_days);
alter table public.delivery_zones add column refrigerated boolean not null default false;
alter table public.delivery_zones add column same_day_cutoff integer not null default 12 check(same_day_cutoff between 0 and 23);
alter table public.orders add column user_id uuid;
alter table public.orders add column guest_hash text;
alter table public.orders add column quote_id uuid;
alter table public.orders add column expires_at timestamptz;
alter table public.orders add column gateway_order_id text unique;
alter table public.orders add column gateway_payment_id text unique;
alter table public.orders add column payment_lease_until timestamptz;
alter table public.orders add column updated_at timestamptz not null default now();
alter table public.orders add column tracking jsonb;
create index orders_user_idx on public.orders(user_id,created_at desc);
create index orders_guest_idx on public.orders(guest_hash,created_at desc);
create index orders_expiry_idx on public.orders(expires_at) where status='pending_payment';
create table public.checkout_quotes(id uuid primary key default gen_random_uuid(),user_id uuid,guest_hash text not null,payload jsonb not null,summary jsonb not null,expires_at timestamptz not null default now()+interval '10 minutes',created_at timestamptz not null default now());
create index quotes_expiry_idx on public.checkout_quotes(expires_at);
create table public.stock_reservations(order_id uuid not null references public.orders(id),kind text not null check(kind in ('variant','piece')),item_id text not null,quantity integer not null check(quantity>0),released boolean not null default false,primary key(order_id,kind,item_id));
create table public.order_events(id bigint generated always as identity primary key,order_id uuid not null references public.orders(id),status text not null,description text not null,created_at timestamptz not null default now());
create index order_events_order_idx on public.order_events(order_id,created_at);
create table public.payment_events(event_id text primary key,order_id uuid references public.orders(id),created_at timestamptz not null default now());
create table public.refund_jobs(id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id),payment_id text unique not null,amount integer not null check(amount>0),status text not null default 'queued',gateway_refund_id text unique,lease_until timestamptz,attempts integer not null default 0,last_error text,created_at timestamptz not null default now());
create table public.customer_profiles(user_id uuid primary key,name text not null default '',phone text not null default '',updated_at timestamptz not null default now());
create table public.addresses(id uuid primary key default gen_random_uuid(),user_id uuid not null,label text not null,data jsonb not null,created_at timestamptz not null default now());
create index addresses_user_idx on public.addresses(user_id);
create table public.customer_carts(user_id uuid primary key,items jsonb not null default '[]',revision integer not null default 1,updated_at timestamptz not null default now());
create table public.rate_limits(bucket text primary key,window_at timestamptz not null default now(),hits integer not null default 1);
create table public.admin_users(user_id uuid primary key,role text not null check(role in ('owner','manager')));
create table public.admin_audit(id bigint generated always as identity primary key,user_id uuid not null,action text not null,resource text not null,created_at timestamptz not null default now());
alter table public.blog_posts add column data jsonb not null default '{}';
alter table public.collections add column active boolean not null default false;
alter table public.stores add column data jsonb not null default '{}';
insert into public.settings(key,value) values ('public','{"name":"Bapi Mistanna Bhandar","address":"Bapi Mistanna Bhandar, Near Overbridge, Mancotta Road, Dibrugarh, Assam 786001","phone":"","hours":"","pickupInstructions":"","policies":[],"launchApproved":false}');
update public.settings set value=value||'{"reservationMinutes":20,"pickupMinDays":1,"cancellationEnabled":true}' where key='commerce';
do $$ declare t text; begin foreach t in array array['checkout_quotes','stock_reservations','order_events','payment_events','refund_jobs','customer_profiles','addresses','customer_carts','rate_limits','admin_users','admin_audit'] loop execute format('alter table public.%I enable row level security',t);end loop;end $$;

create function public.consume_rate_limit(bucket text,max_requests integer) returns boolean language plpgsql security definer set search_path='' as $$
declare hits integer;
begin insert into public.rate_limits as r(bucket) values(consume_rate_limit.bucket)
 on conflict(bucket) do update set hits=case when r.window_at<now()-interval '1 minute' then 1 else r.hits+1 end,window_at=case when r.window_at<now()-interval '1 minute' then now() else r.window_at end returning r.hits into hits;
 return hits<=max_requests;end $$;

create function public.catalogue_page(filters jsonb default '{}') returns jsonb language sql stable security definer set search_path='' as $$
 with items as (
 select p.id,p.slug,p.sort_order,p.created_at,p.data||jsonb_build_object('variants',v.variants,'piecePrice',i.piece_price,'pieceStock',i.pieces) as data,v.price,v.available
 from public.products p
 join lateral (select jsonb_agg(jsonb_build_object('id',id,'label',label,'price',price,'stock',stock) order by sort_order,id) variants,min(price) price,bool_or(stock>0) available from public.product_variants where product_id=p.id) v on v.variants is not null
 left join public.inventory i on i.product_id=p.id
 where p.active
 and (coalesce(filters->>'category','')='' or p.data->>'category'=filters->>'category')
 and (coalesce(filters->>'search','')='' or p.search_document @@ websearch_to_tsquery('simple',left(filters->>'search',100)))
 and (coalesce(filters->>'occasion','')='' or p.data->'tags' ? (filters->>'occasion'))
 and (coalesce(filters->>'dietary','')='' or p.data->'tags' ? (filters->>'dietary'))
 and (coalesce(filters->>'collection','')='' or p.id=any(select unnest(product_ids) from public.collections where id=filters->>'collection' and active))
 and (not coalesce((filters->>'available')::boolean,false) or v.available)
 and (coalesce(filters->>'maxPrice','')='' or v.price<=(filters->>'maxPrice')::numeric)
 and (not coalesce((filters->>'featured')::boolean,false) or coalesce((p.data->>'featured')::boolean,false))
 ), page as (
 select * from items order by
 case when filters->>'sort'='price-asc' then price end asc,
 case when filters->>'sort'='price-desc' then price end desc,
 case when filters->>'sort'='newest' then created_at end desc,
 sort_order,id
 limit least(greatest(coalesce((filters->>'pageSize')::integer,12),1),48)
 offset (greatest(coalesce((filters->>'page')::integer,1),1)-1)*least(greatest(coalesce((filters->>'pageSize')::integer,12),1),48)
 ) select jsonb_build_object('items',coalesce((select jsonb_agg(data) from page),'[]'::jsonb),'total',(select count(*) from items),'page',greatest(coalesce((filters->>'page')::integer,1),1),'pageSize',least(greatest(coalesce((filters->>'pageSize')::integer,12),1),48));
$$;

-- Trusted calculation shared by quotes and reservation creation. Money uses paise internally.
create function public.calculate_checkout(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare item jsonb; piece record; p public.products; v public.product_variants; inv public.inventory; zone public.delivery_zones; coupon public.coupons; cfg jsonb; contact jsonb:=payload->'contact'; lines jsonb:='[]'; demands jsonb:='[]'; unit bigint; sub bigint:=0; ship bigint:=0; discount bigint:=0; qty integer; pieces integer; transport integer:=0; cold boolean:=false; earliest date; today date:=(now() at time zone 'Asia/Kolkata')::date; boxnames jsonb; name text; label text; image text;
begin
 select value into cfg from public.settings where key='commerce';
 if jsonb_array_length(payload->'items') not between 1 and 50 then raise exception 'Your bag must contain between 1 and 50 items.';end if;
 if contact->>'method'='delivery' then
 select * into zone from public.delivery_zones where pincode=contact->>'pincode' and active;
 if not found then raise exception 'Delivery is unavailable for this pincode. Try store pickup or contact us.';end if;
 transport:=zone.max_days; cold:=zone.refrigerated; earliest:=today+zone.min_days;
 if zone.min_days=0 and extract(hour from now() at time zone 'Asia/Kolkata')>=zone.same_day_cutoff then earliest:=today+1;end if;
 elsif contact->>'method'='pickup' then
 if not coalesce((cfg->>'pickupEnabled')::boolean,false) then raise exception 'Store pickup is currently unavailable.';end if;
 earliest:=today+coalesce((cfg->>'pickupMinDays')::integer,1);
 else raise exception 'Choose delivery or pickup.';end if;
 if (contact->>'date')::date<earliest then raise exception 'The earliest available date is %.',earliest;end if;
 for item in select value from jsonb_array_elements(payload->'items') loop
 qty:=(item->>'quantity')::integer;if qty not between 1 and 30 then raise exception 'Invalid quantity.';end if;
 if item?'box' then
 unit:=round((cfg->>'boxFee')::numeric*100);pieces:=0;boxnames:='[]';name:='Your signature mithai box';label:=(item->'box'->>'size')||' handpicked pieces';image:='/images/hero.webp';
 for piece in select key,value from jsonb_each_text(item->'box'->'pieces') loop
 select * into p from public.products where id=piece.key and active;
 if not found or p.data->>'category'='Gift boxes' then raise exception 'A box sweet is unavailable.';end if;
 if coalesce((p.data->>'shelfLifeDays')::integer,0)<=transport or (coalesce((p.data->>'requiresRefrigeration')::boolean,false) and not cold and transport>0) then raise exception '% cannot be delivered safely to this area. Choose pickup or a different sweet.',p.data->>'name';end if;
 select * into inv from public.inventory where product_id=p.id;
 if not found or piece.value::integer not between 1 and 24 or inv.pieces<piece.value::integer*qty then raise exception 'Not enough pieces of % are available.',p.data->>'name';end if;
 pieces:=pieces+piece.value::integer;unit:=unit+round(inv.piece_price*100)*piece.value::integer;
 demands:=demands||jsonb_build_array(jsonb_build_object('kind','piece','id',p.id,'quantity',piece.value::integer*qty));
 boxnames:=boxnames||jsonb_build_array(jsonb_build_object('name',p.data->>'name','quantity',piece.value::integer));
 end loop;
 if pieces not in (6,12,18,24) or pieces<>(item->'box'->>'size')::integer then raise exception 'Please fill every space in your gift box.';end if;
 else
 select * into p from public.products where id=item->>'productId' and active;
 if not found then raise exception 'A sweet in your bag is unavailable.';end if;
 select * into v from public.product_variants where product_id=p.id and id=item->>'variantId';
 if not found or v.stock<qty then raise exception 'The selected weight or quantity of % is unavailable.',p.data->>'name';end if;
 if coalesce((p.data->>'shelfLifeDays')::integer,0)<=transport or (coalesce((p.data->>'requiresRefrigeration')::boolean,false) and not cold and transport>0) then raise exception '% cannot be delivered safely to this area. Choose pickup or a different sweet.',p.data->>'name';end if;
 unit:=round(v.price*100);name:=p.data->>'name';label:=v.label;image:=p.data->>'image';boxnames:=null;
 demands:=demands||jsonb_build_array(jsonb_build_object('kind','variant','id',v.id,'quantity',qty));
 end if;
 if coalesce((item->'gift'->>'wrap')::boolean,false) then unit:=unit+round((cfg->>'wrapFee')::numeric*100);end if;
 if coalesce(item->'gift'->>'date','')<>'' and item->'gift'->>'date'<>contact->>'date' then raise exception 'Gift dates must match the order delivery date. Place separate orders for different dates.';end if;
 sub:=sub+unit*qty;lines:=lines||jsonb_build_array(jsonb_build_object('name',name,'label',label,'image',image,'quantity',qty,'unitPrice',unit/100.0,'gift',item->'gift','boxItems',boxnames,'productId',item->>'productId','variantId',item->>'variantId'));
 end loop;
 if contact->>'method'='delivery' then
 if sub<round(zone.minimum_order*100) then raise exception 'The minimum order for this area is ₹%.',zone.minimum_order;end if;
 ship:=case when sub>=round((cfg->>'freeShipping')::numeric*100) then 0 else round(zone.charge*100) end;
 end if;
 if coalesce(contact->>'coupon','')<>'' then
 select * into coupon from public.coupons where code=upper(contact->>'coupon') and active and (expires_at is null or expires_at>now());
 if not found or sub<round(coupon.minimum_order*100) then raise exception 'This coupon is invalid, expired, or its minimum order has not been met.';end if;
 discount:=least(round(sub*coupon.percent/100.0),round(coupon.max_discount*100));
 end if;
 select jsonb_agg(jsonb_build_object('kind',kind,'id',id,'quantity',quantity) order by kind,id) into demands from (select d->>'kind' kind,d->>'id' id,sum((d->>'quantity')::integer) quantity from jsonb_array_elements(demands) d group by 1,2) x;
 return jsonb_build_object('lines',lines,'demands',demands,'subtotal',sub/100.0,'shipping',ship/100.0,'discount',discount/100.0,'total',(sub+ship-discount)/100.0,'amount',sub+ship-discount,'currency','INR','earliestDate',earliest,'deliveryLabel',case when contact->>'method'='pickup' then 'Store pickup' else zone.name end);
end $$;

create function public.make_quote(payload jsonb,actor_id uuid,guest text) returns jsonb language plpgsql security definer set search_path='' as $$
declare summary jsonb;q public.checkout_quotes;
begin summary:=public.calculate_checkout(payload);insert into public.checkout_quotes(user_id,guest_hash,payload,summary) values(actor_id,guest,payload,summary) returning * into q;
 return (summary-'demands')||jsonb_build_object('id',q.id,'expiresAt',q.expires_at);end $$;

create function public.reserve_order(quote uuid,request uuid,actor_id uuid,guest text) returns jsonb language plpgsql security definer set search_path='' as $$
declare q public.checkout_quotes;o public.orders;s jsonb;d jsonb;affected integer;line jsonb;cfg jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(request::text,0));
 select * into o from public.orders where request_id=request;
 if found then
 if not ((actor_id is not null and o.user_id=actor_id) or o.guest_hash=guest) then raise exception 'This checkout reference is unavailable.';end if;
 if o.quote_id<>quote then raise exception 'This checkout reference was already used. Resume the existing order.';end if;
 return jsonb_build_object('id',o.id,'total',o.total,'status',o.status,'expiresAt',o.expires_at);end if;
 select * into q from public.checkout_quotes where id=quote for update;
 if not found or not ((actor_id is not null and q.user_id=actor_id) or q.guest_hash=guest) then raise exception 'Quote not found. Review your order again.';end if;
 if q.expires_at<now() then raise exception 'Your quote expired. Please review the latest prices.';end if;
 s:=public.calculate_checkout(q.payload);
 if s<>q.summary then raise exception 'Prices or delivery conditions changed. Please review a fresh quote.';end if;
 -- Conditional decrements acquire only demanded inventory rows, in stable order.
 for d in select value from jsonb_array_elements(s->'demands') order by value->>'kind',value->>'id' loop
 if d->>'kind'='variant' then update public.product_variants set stock=stock-(d->>'quantity')::integer where id=d->>'id' and stock>=(d->>'quantity')::integer;
 else update public.inventory set pieces=pieces-(d->>'quantity')::integer where product_id=d->>'id' and pieces>=(d->>'quantity')::integer;end if;
 get diagnostics affected=row_count;if affected<>1 then raise exception 'A sweet just sold out. Please review your bag.';end if;
 end loop;
 select value into cfg from public.settings where key='commerce';
 insert into public.orders(request_id,payload_hash,contact,subtotal,shipping,discount,total,status,user_id,guest_hash,quote_id,expires_at) values(request,md5(q.payload::text),q.payload->'contact',(s->>'subtotal')::numeric,(s->>'shipping')::numeric,(s->>'discount')::numeric,(s->>'total')::numeric,'pending_payment',actor_id,guest,quote,now()+make_interval(mins=>coalesce((cfg->>'reservationMinutes')::integer,20))) returning * into o;
 for d in select value from jsonb_array_elements(s->'demands') loop insert into public.stock_reservations values(o.id,d->>'kind',d->>'id',(d->>'quantity')::integer,false);end loop;
 for line in select value from jsonb_array_elements(s->'lines') loop insert into public.order_items(order_id,snapshot,quantity,unit_price) values(o.id,line,(line->>'quantity')::integer,(line->>'unitPrice')::numeric);end loop;
 insert into public.order_events(order_id,status,description) values(o.id,o.status,'Your sweets are reserved while you complete payment.');
 return jsonb_build_object('id',o.id,'total',o.total,'status',o.status,'expiresAt',o.expires_at);
end $$;

create function public.release_order_stock(target uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.stock_reservations;
begin for r in select * from public.stock_reservations where order_id=target and not released order by kind,item_id for update loop
 if r.kind='variant' then update public.product_variants set stock=stock+r.quantity where id=r.item_id;else update public.inventory set pieces=pieces+r.quantity where product_id=r.item_id;end if;
 update public.stock_reservations set released=true where order_id=r.order_id and kind=r.kind and item_id=r.item_id;end loop;end $$;

create function public.cancel_store_order(target uuid,actor_id uuid,guest text) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.orders;cfg jsonb;
begin select * into o from public.orders where id=target for update;
 if not found or not ((actor_id is not null and o.user_id=actor_id) or o.guest_hash=guest) then raise exception 'Order not found.';end if;
 if o.status in ('cancelled','expired','refund_pending','refunded') then return jsonb_build_object('id',o.id,'status',o.status);end if;
 select value into cfg from public.settings where key='commerce';
 if o.status not in ('pending_payment','paid') or not coalesce((cfg->>'cancellationEnabled')::boolean,false) then raise exception 'This order can no longer be cancelled online. Contact the store.';end if;
 perform public.release_order_stock(o.id);
 if o.status='paid' then insert into public.refund_jobs(order_id,payment_id,amount) values(o.id,o.gateway_payment_id,round(o.total*100)) on conflict(payment_id) do nothing;end if;
 update public.orders set status=case when o.status='paid' then 'refund_pending' else 'cancelled' end,updated_at=now() where id=o.id returning * into o;
 insert into public.order_events(order_id,status,description) values(o.id,o.status,case when o.status='refund_pending' then 'Cancellation accepted. A refund is being processed.' else 'Order cancelled. Your reserved sweets have been released.' end);
 return jsonb_build_object('id',o.id,'status',o.status);end $$;

create function public.expire_reservations() returns integer language plpgsql security definer set search_path='' as $$
declare o public.orders;count integer:=0;
begin for o in select * from public.orders where status='pending_payment' and expires_at<now() order by id limit 100 for update skip locked loop
 perform public.release_order_stock(o.id);update public.orders set status='expired',updated_at=now() where id=o.id;
 insert into public.order_events(order_id,status,description) values(o.id,'expired','The payment window expired. No further stock is reserved.');count:=count+1;end loop;
 delete from public.rate_limits where window_at<now()-interval '1 day';
 delete from public.checkout_quotes where expires_at<now()-interval '7 days' and id not in(select quote_id from public.orders where quote_id is not null);
 return count;end $$;

create function public.record_captured_payment(gateway_order text,payment text,paid_amount bigint,paid_currency text,event text) returns text language plpgsql security definer set search_path='' as $$
declare o public.orders;next_status text;
begin
 select * into o from public.orders where gateway_order_id=gateway_order for update;
 if not found then raise exception 'Payment order is not yet linked. Retry this event.';end if;
 if paid_currency<>'INR' or paid_amount<>round(o.total*100) then raise exception 'Payment amount or currency mismatch.';end if;
 if exists(select 1 from public.payment_events where event_id=event) then return o.status;end if;
 if o.gateway_payment_id is not null and o.gateway_payment_id<>payment then raise exception 'Unexpected additional payment. Reconciliation required.';end if;
 if o.status in ('paid','preparing','shipped','ready_for_pickup','completed','refund_pending','refunded') then insert into public.payment_events values(event,o.id,now()) on conflict do nothing;return o.status;end if;
 if o.status in ('expired','cancelled') or o.expires_at<now() then
 perform public.release_order_stock(o.id);next_status:='refund_pending';insert into public.refund_jobs(order_id,payment_id,amount) values(o.id,payment,paid_amount) on conflict(payment_id) do nothing;
 else next_status:='paid';end if;
 update public.orders set status=next_status,gateway_payment_id=payment,updated_at=now() where id=o.id;
 insert into public.payment_events values(event,o.id,now());
 insert into public.order_events(order_id,status,description) values(o.id,next_status,case when next_status='paid' then 'Payment confirmed. Your order is with our kitchen.' else 'Payment arrived after cancellation or expiry. A full refund is being processed.' end);
 return next_status;end $$;

create function public.claim_payment_order(target uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare affected integer;
begin update public.orders set payment_lease_until=now()+interval '45 seconds' where id=target and status='pending_payment' and expires_at>now() and gateway_order_id is null and (payment_lease_until is null or payment_lease_until<now());get diagnostics affected=row_count;return affected=1;end $$;
create function public.claim_refund_job(target uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare affected integer;
begin update public.refund_jobs set lease_until=now()+interval '2 minutes',status='processing',attempts=attempts+1 where id=target and status in ('queued','processing') and (lease_until is null or lease_until<now());get diagnostics affected=row_count;return affected=1;end $$;
create function public.finish_refund(target uuid,gateway_id text,refund_status text) returns void language plpgsql security definer set search_path='' as $$
declare j public.refund_jobs;
begin select * into j from public.refund_jobs where id=target for update;if not found then raise exception 'Refund job not found.';end if;
 if j.status='processed' then return;end if;
 update public.refund_jobs set gateway_refund_id=gateway_id,status=case when refund_status='processed' then 'processed' when refund_status='failed' then 'failed' else 'submitted' end,lease_until=null where id=target;
 if refund_status='processed' then update public.orders set status='refunded',updated_at=now() where id=j.order_id;insert into public.order_events(order_id,status,description) values(j.order_id,'refunded','Your refund has been processed by the payment provider. Bank processing times may apply.');end if;end $$;

create function public.save_customer_cart(actor_id uuid,cart_items jsonb,expected_revision integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.customer_carts;
begin insert into public.customer_carts(user_id) values(actor_id) on conflict do nothing;select * into c from public.customer_carts where user_id=actor_id for update;
 if c.revision<>expected_revision then raise exception 'Your bag changed on another device. Refresh it before saving.';end if;
 update public.customer_carts set items=cart_items,revision=revision+1,updated_at=now() where user_id=actor_id returning * into c;return jsonb_build_object('items',c.items,'revision',c.revision);end $$;

create function public.transition_order(target uuid,next_status text,tracking_data jsonb,admin_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare o public.orders;
begin if not exists(select 1 from public.admin_users where user_id=admin_id) then raise exception 'Administrator access required.';end if;
 select * into o from public.orders where id=target for update;
 if not found or not ((o.status='paid' and next_status='preparing') or (o.status='preparing' and next_status in ('shipped','ready_for_pickup')) or (o.status in ('shipped','ready_for_pickup') and next_status='completed')) then raise exception 'Invalid order status transition.';end if;
 update public.orders set status=next_status,tracking=tracking_data,updated_at=now() where id=target;
 insert into public.order_events(order_id,status,description) values(target,next_status,case next_status when 'preparing' then 'Your sweets are being prepared.' when 'shipped' then 'Your order is on its way.' when 'ready_for_pickup' then 'Your order is ready to collect.' else 'Order completed. Thank you for shopping with us.' end);
 insert into public.admin_audit(user_id,action,resource) values(admin_id,next_status,target::text);end $$;
-- The original demo request endpoint is retired; only quote-backed reservations may create orders.
revoke execute on function public.create_store_order(jsonb) from service_role;
do $$ declare f record;begin for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('consume_rate_limit','catalogue_page','calculate_checkout','make_quote','reserve_order','release_order_stock','cancel_store_order','expire_reservations','record_captured_payment','claim_payment_order','claim_refund_job','finish_refund','save_customer_cart','transition_order') loop execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);end loop;end $$;
