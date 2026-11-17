-- Admin reads stay behind the BFF. Search is applied before pagination.
create function public.admin_person(target uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; email_address text;
begin
 select jsonb_build_object('name',name,'phone',phone) into result from public.customer_profiles where user_id=target;
 if to_regclass('auth.users') is not null then execute 'select email from auth.users where id=$1' into email_address using target; end if;
 return coalesce(result,'{}')||jsonb_build_object('email',coalesce(email_address,''));
end $$;
create function public.admin_list(resource text,filters jsonb,actor_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare role_name text; table_name text; source text; result jsonb; page_number integer; sort_key text; direction text;
begin
 select role into role_name from public.admin_users where user_id=actor_id;
 if role_name is null then raise exception 'Administrator access required.';end if;
 if resource in ('settings','admin_users','admin_audit','users') and role_name<>'owner' then raise exception 'Owner access required.';end if;
 if resource not in ('products','orders','customers','delivery_zones','coupons','collections','festival_campaigns','blog_posts','stores','reviews','refund_jobs','settings','admin_users','admin_audit','users') then raise exception 'Unknown admin resource.';end if;
 page_number:=greatest(1,least(100000,coalesce((filters->>'page')::integer,1)));
 table_name:=case resource when 'customers' then 'customer_profiles' else resource end;
 if resource='users' then
 if to_regclass('auth.users') is null then source:='select jsonb_build_object(''id'',user_id,''person'',public.admin_person(user_id)) d from public.customer_profiles';
 else source:='select jsonb_build_object(''id'',id,''person'',public.admin_person(id)) d from auth.users';end if;
 else
 source:=format('select to_jsonb(t) %s d from public.%I t',case resource
 when 'products' then '||jsonb_build_object(''product_variants'',coalesce((select jsonb_agg(v order by v.sort_order,v.id) from public.product_variants v where v.product_id=t.id),''[]''::jsonb),''inventory'',(select to_jsonb(i) from public.inventory i where i.product_id=t.id))'
 when 'admin_users' then '||jsonb_build_object(''person'',public.admin_person(t.user_id))'
 when 'admin_audit' then '||jsonb_build_object(''person'',public.admin_person(t.user_id))'
 when 'refund_jobs' then '||jsonb_build_object(''customer_name'',(select o.contact->>''name'' from public.orders o where o.id=t.order_id))'
 when 'reviews' then '||jsonb_build_object(''product_name'',(select p.data->>''name'' from public.products p where p.id=t.product_id))'
 else '' end,table_name);
 end if;
 sort_key:=case when filters->>'sort'='name' then 'name' when filters->>'sort' in ('newest','oldest') and resource in ('products','orders','reviews','refund_jobs','admin_audit') then 'created_at' when resource='products' then 'sort_order' when resource in ('orders','reviews','refund_jobs','admin_audit') then 'created_at' when resource='customers' then 'updated_at' else 'id' end;
 direction:=case when filters->>'sort'='oldest' or sort_key in ('name','sort_order','id') then 'asc' else 'desc' end;
 execute format($query$
 with source as (%s), filtered as (select d from source where
 (d->>'id'=nullif($1->>'selected','') or $1->>'q' is null or strpos(lower(d::text),lower($1->>'q'))>0)
 and (coalesce($1->>'status','')='' or coalesce(d->>'status',d->>'role',d->>'active',d->>'published')=$1->>'status')
 and (coalesce($1->>'method','')='' or d->'contact'->>'method'=$1->>'method')
 and (coalesce($1->>'from','')='' or (d->>'created_at')::timestamptz>=(($1->>'from')||'T00:00:00+05:30')::timestamptz)
 and (coalesce($1->>'to','')='' or (d->>'created_at')::timestamptz<(($1->>'to')||'T00:00:00+05:30')::timestamptz+interval '1 day')),
 page as (select d from filtered order by (d->>'id'=nullif($1->>'selected','')) desc nulls last,%s %s,coalesce(d->>'id',d->>'user_id',d->>'key',d->>'slug',d->>'code') asc limit 50 offset $2)
 select jsonb_build_object('items',coalesce((select jsonb_agg(d) from page),'[]'::jsonb),'total',(select count(*) from filtered),'page',$3,'pageSize',50)
 $query$,source,case when sort_key='name' then 'coalesce(d->''data''->>''name'',d->>''name'',d->>''title'',d->''person''->>''name'',d->''person''->>''email'',d->''contact''->>''name'',d->>''key'',d->>''code'',d->>''slug'')' when sort_key='sort_order' then '(d->>''sort_order'')::integer' else format('d->>%L',sort_key) end,direction) into result using filters,(page_number-1)*50,page_number;
 return result;
end $$;
create function public.revoke_admin_access(actor_id uuid,target uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('bapi-admin-owners',0));
 if not exists(select 1 from public.admin_users where user_id=actor_id and role='owner') then raise exception 'Owner access required.';end if;
 if exists(select 1 from public.admin_users where user_id=target and role='owner') and (select count(*) from public.admin_users where role='owner')<=1 then raise exception 'The last owner cannot be removed.';end if;
 delete from public.admin_users where user_id=target;
 if not found then raise exception 'Team member no longer has access.';end if;
 insert into public.admin_audit(user_id,action,resource) values(actor_id,'revoke:admin_users',target::text);
 return jsonb_build_object('revoked',true);
end $$;
-- Serialize grant/demotion and revocation before checking the actor's access.
-- Synchronize the two historical contact representations in the same transaction.
alter function public.admin_write(text,jsonb,uuid) rename to admin_write_internal;
create function public.admin_write(resource text,document jsonb,actor_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if resource='admin_users' then perform pg_advisory_xact_lock(hashtextextended('bapi-admin-owners',0));end if;
 if resource='stores' or (resource='settings' and document->>'key' in ('public','commerce')) then perform pg_advisory_xact_lock(hashtextextended('bapi-store-settings',0));end if;
 result:=public.admin_write_internal(resource,document,actor_id);
 if resource='stores' then
 update public.settings set value=value||jsonb_build_object('name',document->>'name','address',document->>'address','phone',document->>'phone','hours',document->'data'->>'hours','pickupInstructions',document->'data'->>'pickupInstructions') where key='public';
 update public.settings set value=value||jsonb_build_object('pickupEnabled',(document->>'pickup_enabled')::boolean) where key='commerce';
 elsif resource='settings' and document->>'key'='public' then
 update public.stores set name=document->'value'->>'name',address=document->'value'->>'address',phone=document->'value'->>'phone',data=data||jsonb_build_object('hours',document->'value'->>'hours','pickupInstructions',document->'value'->>'pickupInstructions') where id='main';
 elsif resource='settings' and document->>'key'='commerce' then
 update public.stores set pickup_enabled=(document->'value'->>'pickupEnabled')::boolean where id='main';
 end if;
 return result;
end $$;
-- Reconcile existing contact values using the former public-content precedence.
update public.settings s set value=s.value||jsonb_build_object('address',coalesce(nullif(t.address,''),s.value->>'address'),'phone',coalesce(nullif(t.phone,''),s.value->>'phone'),'hours',coalesce(nullif(t.data->>'hours',''),s.value->>'hours'),'pickupInstructions',coalesce(nullif(t.data->>'pickupInstructions',''),s.value->>'pickupInstructions')) from public.stores t where s.key='public' and t.id='main';
update public.stores t set name=s.value->>'name',address=s.value->>'address',phone=s.value->>'phone',data=t.data||jsonb_build_object('hours',s.value->>'hours','pickupInstructions',s.value->>'pickupInstructions') from public.settings s where s.key='public' and t.id='main';
-- Keep checkout's existing pickup setting when reconciling old records.
update public.stores set pickup_enabled=coalesce((select (value->>'pickupEnabled')::boolean from public.settings where key='commerce'),false) where id='main';
do $$ declare src text;begin
 select pg_get_functiondef('public.transition_order(uuid,text,jsonb,uuid)'::regprocedure) into src;
 src:=replace(src,'update public.orders set status=next_status,tracking=tracking_data,', $patch$if (next_status='shipped' and o.contact->>'method' is distinct from 'delivery') or (next_status='ready_for_pickup' and o.contact->>'method' is distinct from 'pickup') then raise exception 'Status does not match the fulfilment method.';end if;
 update public.orders set status=next_status,tracking=case when next_status='shipped' then tracking_data else o.tracking end,$patch$);
 execute src;
end $$;
do $$ declare f record;begin for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('admin_person','admin_list','revoke_admin_access','admin_write','admin_write_internal') loop execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);end loop;end $$;
