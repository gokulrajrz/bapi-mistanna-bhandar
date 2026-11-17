create table public.service_health(name text primary key,status text not null,last_attempt_at timestamptz not null default now(),last_success_at timestamptz,details jsonb not null default '{}');
alter table public.service_health enable row level security;
revoke all on public.service_health from public,anon,authenticated;
grant select,insert,update on public.service_health to service_role;
create function public.operations_health() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('maintenance',(select to_jsonb(h) from public.service_health h where name='maintenance'),'overdueReservations',(select count(*) from public.orders where status='pending_payment' and expires_at<now()-interval '10 minutes'),'refundsNeedingReview',(select count(*) from public.refund_jobs where status in ('failed','needs_review')),'agedRefunds',(select count(*) from public.refund_jobs where status in ('queued','processing','submitted') and created_at<now()-interval '1 hour'));
$$;
revoke all on function public.operations_health() from public,anon,authenticated;
grant execute on function public.operations_health() to service_role;
