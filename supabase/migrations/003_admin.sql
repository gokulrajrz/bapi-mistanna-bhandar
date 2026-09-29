alter table public.product_variants add column active boolean not null default true;
insert into public.settings(key,value) values
('operations','{"checkoutEnabled":false,"maintenanceMode":false,"maintenanceMessage":"We are preparing something sweet. Please check back shortly.","reviewSubmissions":true,"bulkEnquiries":true}'),
('storefront','{"announcement":"A little sweetness. A little closer to home.","tagline":"ASSAM · HANDCRAFTED WITH LOVE","heroEyebrow":"FROM THE HEART OF ASSAM","heroTitle":"A little sweet.","heroAccent":"A little Assam.","heroDescription":"Handcrafted mithai. Familiar flavours.\nFor moments that deserve a little more love.","heroImage":"/images/hero.webp","heroCta":"Discover our sweets","heroLink":"/shop","footerTitle":"Good things.\nMade to be shared.","footerDescription":"A little piece of Assam, from our kitchen to yours.","primaryColor":"#692c36","backgroundColor":"#fbf8f1","seoDescription":"Discover Assamese specialties, handcrafted mithai and thoughtful gifting in Dibrugarh.","socialImage":"/images/hero.webp","navigation":[{"label":"Shop","to":"/shop"},{"label":"Gifting","to":"/gifts"},{"label":"Build a box","to":"/build-a-box"},{"label":"Our story","to":"/story"},{"label":"Journal","to":"/journal"}],"sections":{"bestsellers":true,"introduction":true,"occasions":true,"boxBuilder":true,"journal":true},"storyTitle":"Made the old way. Shared in your own way.","storyParagraphs":["At Bapi Mistanna Bhandar, there is always a reason to share something sweet. A festival. A familiar face. A quiet cup of afternoon tea.","Our home is Dibrugarh, Assam. The flavours of pitha and laru sit beside much-loved mithai classics, bringing regional favourites and everyday celebrations to the same table."],"giftsTitle":"Send something sweet.","giftsDescription":"A little sweetness from Assam, for the people who make life sweeter."}');
create function public.admin_write(resource text,document jsonb,actor_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare role_name text;p jsonb;v jsonb;table_name text;key_name text;columns text;updates text;result jsonb;identity text;existing_owner_count integer;
begin
 select role into role_name from public.admin_users where user_id=actor_id;
 if role_name is null then raise exception 'Administrator access required.';end if;
 if resource in ('admin_users','settings') and role_name<>'owner' then raise exception 'Owner access required.';end if;
 if resource='products' then
 p:=document->'data'||jsonb_build_object('id',document->>'id','slug',document->>'slug');
 insert into public.products(id,slug,data,active,sort_order) values(document->>'id',document->>'slug',p,(document->>'active')::boolean,(document->>'sort_order')::integer)
 on conflict(id) do update set slug=excluded.slug,data=excluded.data,active=excluded.active,sort_order=excluded.sort_order;
 update public.product_variants set active=false where product_id=document->>'id';
 for v in select value from jsonb_array_elements(document->'variants') order by value->>'id' loop
 if exists(select 1 from public.product_variants where id=v->>'id' and product_id<>document->>'id') then raise exception 'Variant belongs to another product.';end if;
 insert into public.product_variants(id,product_id,label,price,stock,sort_order,active) values(v->>'id',document->>'id',v->>'label',(v->>'price')::numeric,(v->>'stock')::integer,(v->>'sort_order')::integer,true)
 on conflict(id) do update set label=excluded.label,price=excluded.price,stock=excluded.stock,sort_order=excluded.sort_order,active=true;end loop;
 insert into public.inventory(product_id,piece_price,pieces) values(document->>'id',(document->'inventory'->>'piece_price')::numeric,(document->'inventory'->>'pieces')::integer) on conflict(product_id) do update set piece_price=excluded.piece_price,pieces=excluded.pieces;
 result:=document;identity:=document->>'id';
 elsif resource='settings' then
 insert into public.settings(key,value) values(document->>'key',document->'value') on conflict(key) do update set value=excluded.value;result:=document;identity:=document->>'key';
 elsif resource='reviews' then
 update public.reviews set published=(document->>'published')::boolean where id=(document->>'id')::uuid;result:=document;identity:=document->>'id';
 elsif resource in ('delivery_zones','coupons','collections','festival_campaigns','blog_posts','stores','admin_users') then
 table_name:=resource;key_name:=case resource when 'coupons' then 'code' when 'blog_posts' then 'slug' when 'admin_users' then 'user_id' else 'id' end;
 if resource='admin_users' then
 perform pg_advisory_xact_lock(hashtextextended('bapi-admin-owners',0));
 if exists(select 1 from public.admin_users where user_id=(document->>'user_id')::uuid and role='owner') and document->>'role'<>'owner' and (select count(*) from public.admin_users where role='owner')<=1 then raise exception 'The last owner cannot be demoted.';end if;end if;
 select string_agg(format('%I',key),','),string_agg(format('%I=excluded.%I',key,key),',') filter(where key<>key_name) into columns,updates from jsonb_object_keys(document) key;
 execute format('insert into public.%I(%s) overriding system value select %s from jsonb_populate_record(null::public.%I,$1) on conflict(%I) do update set %s returning to_jsonb(%I.*)',table_name,columns,columns,table_name,key_name,updates,table_name) using document into result;identity:=result->>key_name;
 else raise exception 'Unknown admin resource.';end if;
 insert into public.admin_audit(user_id,action,resource) values(actor_id,'save:'||resource,identity);return result;
end $$;
revoke all on function public.admin_write(text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.admin_write(text,jsonb,uuid) to service_role;
-- Apply active variant filtering to existing functions without dropping dependencies.
do $$ declare src text;begin
 select pg_get_functiondef('public.catalogue_page(jsonb)'::regprocedure) into src;src:=replace(src,'where product_id=p.id)','where product_id=p.id and active)');execute src;
 select pg_get_functiondef('public.calculate_checkout(jsonb)'::regprocedure) into src;src:=replace(src,'where product_id=p.id and id=item->>''variantId'';','where product_id=p.id and id=item->>''variantId'' and active;');execute src;
end $$;
