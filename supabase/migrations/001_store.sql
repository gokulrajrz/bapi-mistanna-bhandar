-- All commerce access goes through Cloudflare Pages Functions. No anonymous writes.
create table public.products(id text primary key,slug text unique not null,data jsonb not null,active boolean not null default false,sort_order integer not null default 0);
create table public.product_variants(id text primary key,product_id text not null references public.products(id),label text not null,price numeric(12,2) not null check(price>=0),stock integer not null default 0 check(stock>=0));
create index on public.product_variants(product_id);
create table public.inventory(product_id text primary key references public.products(id),piece_price numeric(12,2) not null check(piece_price>=0),pieces integer not null default 0 check(pieces>=0));
create table public.delivery_zones(id bigint generated always as identity primary key,name text not null,pincode text unique not null,charge numeric(12,2) not null check(charge>=0),minimum_order numeric(12,2) not null default 0,active boolean not null default false);
create table public.coupons(code text primary key,percent integer not null check(percent between 1 and 100),max_discount numeric(12,2) not null,minimum_order numeric(12,2) not null default 0,expires_at timestamptz,active boolean not null default false);
create table public.orders(id uuid primary key default gen_random_uuid(),request_id uuid unique not null,payload_hash text not null,contact jsonb not null,subtotal numeric(12,2) not null,shipping numeric(12,2) not null,discount numeric(12,2) not null,total numeric(12,2) not null,status text not null default 'requested',created_at timestamptz not null default now());
create table public.order_items(id bigint generated always as identity primary key,order_id uuid not null references public.orders(id),snapshot jsonb not null,quantity integer not null check(quantity>0),unit_price numeric(12,2) not null check(unit_price>=0));
create index on public.order_items(order_id);
create table public.reviews(id uuid primary key default gen_random_uuid(),product_id text not null references public.products(id),order_id uuid references public.orders(id),name text not null,rating integer not null check(rating between 1 and 5),body text not null,verified boolean not null default false,published boolean not null default false,created_at timestamptz not null default now());
create index on public.reviews(product_id) where published=true;
create table public.collections(id text primary key,title text not null,description text,product_ids text[] not null default '{}',hero text);
create table public.festival_campaigns(id text primary key,collection_id text references public.collections(id),banner text,starts_at timestamptz,ends_at timestamptz,active boolean not null default false);
create table public.blog_posts(slug text primary key,title text not null,body text not null,published boolean not null default false);
create table public.stores(id text primary key,name text not null,address text,phone text,hours jsonb,pickup_enabled boolean not null default false);
create table public.settings(key text primary key,value jsonb not null);
insert into public.settings values ('commerce','{"boxFee":99,"wrapFee":49,"freeShipping":999,"pickupEnabled":false}');
-- No public policies: both anonymous and authenticated browser clients are denied.
do $$ declare t text; begin foreach t in array array['products','product_variants','inventory','delivery_zones','coupons','orders','order_items','reviews','collections','festival_campaigns','blog_posts','stores','settings'] loop execute format('alter table public.%I enable row level security',t); end loop; end $$;

create or replace function public.create_store_order(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 existing public.orders; item jsonb; piece record; prod public.products; variant public.product_variants; inv public.inventory; zone public.delivery_zones; coupon public.coupons;
 cfg jsonb; contact jsonb:=payload->'contact'; result_id uuid; unit numeric; subtotal numeric:=0; shipping numeric:=0; discount numeric:=0; line_items jsonb:='[]'; quantity integer; cnt integer; total_pieces integer; fingerprint text:=md5(payload::text);
begin
 -- Serialize retries for a request; unique request IDs alone are not enough for inventory safety.
 perform pg_advisory_xact_lock(hashtextextended(payload->>'requestId',0));
 select * into existing from public.orders where request_id=(payload->>'requestId')::uuid;
 if found then
  if existing.payload_hash<>fingerprint then raise exception 'This checkout reference was already used. Refresh checkout before trying a different order.'; end if;
  return jsonb_build_object('id',existing.id,'total',existing.total,'status',existing.status);
 end if;
 if jsonb_array_length(payload->'items')<1 or jsonb_array_length(payload->'items')>50 then raise exception 'Your bag must contain between 1 and 50 items.'; end if;
 if (contact->>'date')::date < (now() at time zone 'Asia/Kolkata')::date then raise exception 'Choose today or a future date.'; end if;
 select value into cfg from public.settings where key='commerce';
 -- Stable lock order avoids overlapping carts deadlocking. Suitable for a small local shop.
 perform id from public.product_variants order by id for update;
 perform product_id from public.inventory order by product_id for update;
 for item in select value from jsonb_array_elements(payload->'items') loop
  quantity:=(item->>'quantity')::integer;
  if quantity<1 or quantity>30 then raise exception 'Invalid item quantity.'; end if;
  if item ? 'box' then
   cnt:=(item->'box'->>'size')::integer;
   if cnt not in (6,12,18,24) then raise exception 'Choose a valid gift box size.'; end if;
   unit:=(cfg->>'boxFee')::numeric; total_pieces:=0;
   for piece in select key,value from jsonb_each_text(item->'box'->'pieces') loop
    if piece.value::integer<1 or piece.value::integer>24 then raise exception 'Invalid sweet quantity.'; end if;
    select * into prod from public.products where id=piece.key and active=true;
    if not found or prod.data->>'category'='Gift boxes' then raise exception 'A selected box sweet is no longer available.'; end if;
    select * into inv from public.inventory where product_id=piece.key;
    if not found or inv.pieces<piece.value::integer*quantity then raise exception 'Not enough pieces available for this gift box.'; end if;
    total_pieces:=total_pieces+piece.value::integer; unit:=unit+inv.piece_price*piece.value::integer;
    update public.inventory set pieces=pieces-piece.value::integer*quantity where product_id=piece.key;
   end loop;
   if total_pieces<>cnt then raise exception 'Please fill every space in your gift box.'; end if;
  else
   select * into prod from public.products where id=item->>'productId' and active=true;
   if not found then raise exception 'A sweet in your bag is no longer available.'; end if;
   select * into variant from public.product_variants where id=item->>'variantId' and product_id=prod.id;
   if not found or variant.stock<quantity then raise exception 'The selected weight or quantity is unavailable.'; end if;
   unit:=variant.price;
   update public.product_variants set stock=stock-quantity where id=variant.id;
  end if;
  if coalesce((item->'gift'->>'wrap')::boolean,false) then unit:=unit+(cfg->>'wrapFee')::numeric; end if;
  subtotal:=subtotal+unit*quantity;
  line_items:=line_items||jsonb_build_array(jsonb_build_object('item',item,'quantity',quantity,'unit_price',unit));
 end loop;
 if contact->>'method'='pickup' then
  if not coalesce((cfg->>'pickupEnabled')::boolean,false) then raise exception 'Store pickup is not available yet.'; end if;
 elsif contact->>'method'='delivery' then
  select * into zone from public.delivery_zones where pincode=contact->>'pincode' and active=true;
  if not found then raise exception 'Delivery is not yet available for this pincode. Please contact the store.'; end if;
  if subtotal<zone.minimum_order then raise exception 'Your order is below the minimum for this delivery area.'; end if;
  shipping:=case when subtotal >= (cfg->>'freeShipping')::numeric then 0 else zone.charge end;
 else raise exception 'Choose delivery or pickup.'; end if;
 if coalesce(contact->>'coupon','')<>'' then
  select * into coupon from public.coupons where code=upper(contact->>'coupon') and active=true and (expires_at is null or expires_at>now());
  if not found or subtotal<coupon.minimum_order then raise exception 'This coupon is invalid, expired, or its minimum order has not been met.'; end if;
  discount:=least(round(subtotal*coupon.percent/100),coupon.max_discount);
 end if;
 insert into public.orders(request_id,payload_hash,contact,subtotal,shipping,discount,total) values((payload->>'requestId')::uuid,fingerprint,contact,subtotal,shipping,discount,subtotal+shipping-discount) returning id into result_id;
 for item in select value from jsonb_array_elements(line_items) loop
  insert into public.order_items(order_id,snapshot,quantity,unit_price) values(result_id,item->'item',(item->>'quantity')::integer,(item->>'unit_price')::numeric);
 end loop;
 return jsonb_build_object('id',result_id,'total',subtotal+shipping-discount,'status','requested');
end $$;
revoke all on function public.create_store_order(jsonb) from public,anon,authenticated;
grant execute on function public.create_store_order(jsonb) to service_role;
