import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
const directory = process.env.MIGRATION_OUTPUT || "/tmp/bapi-database-setup";
mkdirSync(directory, { recursive: true, mode: 0o700 });
const files = readdirSync("supabase/migrations")
  .filter((f) => f.endsWith(".sql"))
  .sort();
writeFileSync(
  `${directory}/migrations.sql`,
  files
    .map((f) => `-- ${f}\n${readFileSync(`supabase/migrations/${f}`, "utf8")}`)
    .join("\n"),
);
console.log(
  `Prepared ${files.length} migrations at ${directory}/migrations.sql. Apply in a fresh project; do not reapply already-run migrations. Development seed is separate.`,
);
