// Logical backup drill: restores only to an empty, local *_restore_drill database.
import { spawnSync } from "node:child_process";
import { mkdirSync, chmodSync } from "node:fs";
const source = process.env.BACKUP_SOURCE_URL,
  target = process.env.RESTORE_DATABASE_URL;
if (!source || !target)
  throw Error(
    "Set BACKUP_SOURCE_URL and RESTORE_DATABASE_URL locally. Never commit these values.",
  );
const destination = new URL(target);
if (
  !["localhost", "127.0.0.1", "::1", "[::1]"].includes(destination.hostname) ||
  !destination.pathname.endsWith("_restore_drill")
)
  throw Error(
    "Restore target must be a local database whose name ends with _restore_drill.",
  );
const dir = "/tmp/bapi-restore-drill";
mkdirSync(dir, { recursive: true, mode: 0o700 });
chmodSync(dir, 0o700);
function pgEnv(url) {
  const u = new URL(url);
  return {
    ...process.env,
    PGHOST: u.hostname,
    PGPORT: u.port || "5432",
    PGDATABASE: decodeURIComponent(u.pathname.slice(1)),
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGSSLMODE: u.searchParams.get("sslmode") || "prefer",
  };
}
function run(tool, args, url) {
  const result = spawnSync(tool, args, { env: pgEnv(url), encoding: "utf8" });
  if (result.status !== 0)
    throw Error(
      `${tool} failed. No database contents or credentials are printed; inspect locally.`,
    );
  return result.stdout.trim();
}
const existing = run(
  "psql",
  [
    "-XAtc",
    "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'",
  ],
  target,
);
if (existing !== "0")
  throw Error(
    "Restore target is not empty. Create a fresh local drill database.",
  );
const dependencies = run(
  "psql",
  [
    "-XAtc",
    "select to_regclass('auth.users') is not null and exists(select 1 from pg_roles where rolname='service_role') and exists(select 1 from pg_roles where rolname='anon') and exists(select 1 from pg_roles where rolname='authenticated')",
  ],
  target,
);
if (dependencies !== "t")
  throw Error(
    "Restore Auth dependencies and Supabase roles into the isolated target first. This drill restores only the public application schema.",
  );
run(
  "pg_dump",
  [
    "--format=custom",
    "--no-owner",
    "--schema=public",
    "--file",
    `${dir}/store.dump`,
  ],
  source,
);
chmodSync(`${dir}/store.dump`, 0o600);
run(
  "pg_restore",
  [
    "--dbname",
    decodeURIComponent(destination.pathname.slice(1)),
    "--exit-on-error",
    "--single-transaction",
    "--no-owner",
    `${dir}/store.dump`,
  ],
  target,
);
const check =
  "select json_build_object('orders',(select count(*) from public.orders),'items',(select count(*) from public.order_items),'products',(select count(*) from public.products),'invalidStock',(select count(*) from public.product_variants where stock<0),'orphanItems',(select count(*) from public.order_items i left join public.orders o on o.id=i.order_id where o.id is null))";
const restored = JSON.parse(run("psql", ["-XAtc", check], target));
if (restored.invalidStock || restored.orphanItems)
  throw Error("Restored integrity checks failed.");
console.log(
  JSON.stringify({
    restored: true,
    checks: restored,
    backupLocation: `${dir}/store.dump`,
    scope:
      "Public application schema; excludes Supabase Auth/Storage and their external assets. Use provider recovery for a complete project.",
  }),
);
