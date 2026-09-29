create function public.admin_cancel_order(target uuid, actor_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.orders;result jsonb;
begin
 if not exists(select 1 from public.admin_users where user_id=actor_id) then raise exception 'Administrator access required.';end if;
 select * into o from public.orders where id=target for update;
 if not found then raise exception 'Order not found.';end if;
 result := public.cancel_store_order(target,o.user_id,o.guest_hash);
 insert into public.admin_audit(user_id,action,resource) values(actor_id,'cancel',target::text);
 return result;
end $$;
revoke all on function public.admin_cancel_order(uuid,uuid) from public,anon,authenticated;
grant execute on function public.admin_cancel_order(uuid,uuid) to service_role;
