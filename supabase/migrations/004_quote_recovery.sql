-- A quote is a single checkout, even when a client loses its request ID.
create unique index orders_one_per_quote on public.orders(quote_id) where quote_id is not null;
do $$
declare definition text;
begin
 select pg_get_functiondef('public.reserve_order(uuid,uuid,uuid,text)'::regprocedure) into definition;
 definition := replace(definition,
 'if q.expires_at<now() then',
 'select * into o from public.orders where quote_id=quote;
 if found then return jsonb_build_object(''id'',o.id,''total'',o.total,''status'',o.status,''expiresAt'',o.expires_at);end if;
 if q.expires_at<now() then');
 execute definition;
end $$;
