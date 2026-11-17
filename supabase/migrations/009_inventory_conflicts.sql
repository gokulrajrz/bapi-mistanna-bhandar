-- Optimistic concurrency covers catalogue edits and every stock movement.
alter table public.products add column revision bigint not null default 1;
alter table public.product_variants add column revision bigint not null default 1;
alter table public.inventory add column revision bigint not null default 1;
create function public.bump_revision() returns trigger language plpgsql set search_path='' as $$begin new.revision:=old.revision+1;return new;end $$;
create trigger products_revision before update on public.products for each row execute function public.bump_revision();
create trigger variants_revision before update on public.product_variants for each row execute function public.bump_revision();
create trigger inventory_revision before update on public.inventory for each row execute function public.bump_revision();
do $$ declare definition text;begin
 select pg_get_functiondef('public.admin_write(text,jsonb,uuid)'::regprocedure) into definition;
 definition:=replace(definition,'if resource=''products'' then',
 'if resource=''products'' then
 perform pg_advisory_xact_lock(hashtextextended(''product:''||(document->>''id''),0));
 perform 1 from public.products where id=document->>''id'' for update;
 if exists(select 1 from public.products where id=document->>''id'') and not exists(select 1 from public.products where id=document->>''id'' and revision=(document->>''revision'')::bigint) then raise exception ''This product changed. Reload it before saving.'';end if;
 perform 1 from public.inventory where product_id=document->>''id'' for update;
 perform 1 from public.product_variants where product_id=document->>''id'' order by id for update;
 if exists(select 1 from public.inventory where product_id=document->>''id'') and not exists(select 1 from public.inventory where product_id=document->>''id'' and revision=(document->''inventory''->>''revision'')::bigint) then raise exception ''Stock changed while you were editing. Reload the product before saving.'';end if;
 for v in select value from jsonb_array_elements(document->''variants'') loop
 if exists(select 1 from public.product_variants where id=v->>''id'') and not exists(select 1 from public.product_variants where id=v->>''id'' and revision=(v->>''revision'')::bigint) then raise exception ''Stock changed while you were editing. Reload the product before saving.'';end if;
 end loop;');
 execute definition;
end $$;
