-- Admin product writes lock the parent product before changing variants.
-- Reservations take parent locks in stable order before rechecking quoted prices.
do $$ declare definition text;begin
 select pg_get_functiondef('public.reserve_order(uuid,uuid,uuid,text)'::regprocedure) into definition;
 definition := replace(definition,'s:=public.calculate_checkout(q.payload);',
 'perform 1 from public.products p where p.id in (
 select case when lock_item.value->>''kind''=''piece'' then lock_item.value->>''id'' else (select v.product_id from public.product_variants v where v.id=lock_item.value->>''id'') end
 from jsonb_array_elements(q.summary->''demands'') as lock_item(value)
 ) order by p.id for share;
 s:=public.calculate_checkout(q.payload);');
 execute definition;
end $$;
