-- The input parameter "bucket" also names a column: use the PK constraint
-- explicitly so PostgreSQL never resolves ON CONFLICT to a PL/pgSQL variable.
do $$ declare definition text;begin
 select pg_get_functiondef('public.consume_rate_limit(text,integer)'::regprocedure) into definition;
 definition:=replace(definition,'on conflict(bucket)','on conflict on constraint rate_limits_pkey');
 execute definition;
end $$;
