update public.settings set value=value||'{"boxSizes":[6,12,18,24]}'::jsonb where key='commerce';
do $$ declare definition text;begin
 select pg_get_functiondef('public.calculate_checkout(jsonb)'::regprocedure) into definition;
 definition:=replace(definition,'piece.value::integer not between 1 and 24','piece.value::integer not between 1 and 48');
 definition:=replace(definition,'pieces not in (6,12,18,24)','not exists(select 1 from jsonb_array_elements_text(cfg->''boxSizes'') as allowed(size) where allowed.size::integer=pieces)');
 execute definition;
end $$;
