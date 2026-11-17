-- Every synchronized write bumps the affected record's version, including writes
-- caused by another editor (Store -> public/commerce or settings -> Store).
alter table public.settings add column revision bigint not null default 1;
alter table public.stores add column revision bigint not null default 1;
create trigger settings_revision before update on public.settings for each row execute function public.bump_revision();
create trigger stores_revision before update on public.stores for each row execute function public.bump_revision();

alter function public.admin_write(text,jsonb,uuid) rename to admin_write_synchronized;
create function public.admin_write(resource text,document jsonb,actor_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare current_revision bigint; expected_revision bigint; result jsonb; role_name text;
begin
 if resource not in ('settings','stores') then
   return public.admin_write_synchronized(resource,document,actor_id);
 end if;
 -- Use the same lock as synchronization, and acquire it before reading versions.
 perform pg_advisory_xact_lock(hashtextextended('bapi-store-settings',0));
 select role into role_name from public.admin_users where user_id=actor_id;
 if role_name is null then raise exception 'Administrator access required.';end if;
 if resource='settings' and role_name<>'owner' then raise exception 'Owner access required.';end if;
 expected_revision := (document->>'revision')::bigint;
 if resource='settings' then
   select revision into current_revision from public.settings where key=document->>'key';
 else
   select revision into current_revision from public.stores where id=document->>'id';
 end if;
 if expected_revision is null or expected_revision<>coalesce(current_revision,0) then
   raise exception 'These settings changed while you were editing. Your changes were not saved. Keep your draft, or close and reopen the editor to review the latest values.';
 end if;
 result := public.admin_write_synchronized(resource,document-'revision',actor_id);
 if resource='settings' then
   select revision into current_revision from public.settings where key=document->>'key';
 else
   select revision into current_revision from public.stores where id=document->>'id';
 end if;
 return result||jsonb_build_object('revision',current_revision);
end $$;
revoke all on function public.admin_write(text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.admin_write(text,jsonb,uuid) to service_role;
-- The BFF must enter through the conflict-checking function, not its helpers.
revoke all on function public.admin_write_synchronized(text,jsonb,uuid) from public,anon,authenticated,service_role;
revoke all on function public.admin_write_internal(text,jsonb,uuid) from public,anon,authenticated,service_role;
create index orders_customer_history_order on public.orders(user_id,created_at desc,id desc);
