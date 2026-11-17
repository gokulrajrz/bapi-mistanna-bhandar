alter table public.customer_profiles add column staff_notes text not null default '';
alter table public.customer_profiles add column revision bigint not null default 1;
create trigger customer_revision before update on public.customer_profiles for each row execute function public.bump_revision();
create index customer_profiles_updated on public.customer_profiles(updated_at desc,user_id);
create function public.admin_customer_update(actor_id uuid,document jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;begin
 if not exists(select 1 from public.admin_users where user_id=actor_id) then raise exception 'Administrator access required.';end if;
 update public.customer_profiles set name=document->>'name',phone=document->>'phone',staff_notes=document->>'staff_notes',updated_at=now() where user_id=(document->>'user_id')::uuid and revision=(document->>'revision')::bigint returning to_jsonb(customer_profiles.*) into result;
 if not found then raise exception 'Customer details changed. Reload before saving.';end if;
 insert into public.admin_audit(user_id,action,resource) values(actor_id,'update_customer',document->>'user_id');return result;
end $$;
revoke all on function public.admin_customer_update(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.admin_customer_update(uuid,jsonb) to service_role;
-- Existing account/order holders become visible without reading auth internals.
insert into public.customer_profiles(user_id,name,phone) select distinct on(user_id) user_id,contact->>'name',contact->>'phone' from public.orders where user_id is not null order by user_id,created_at desc on conflict(user_id) do nothing;
