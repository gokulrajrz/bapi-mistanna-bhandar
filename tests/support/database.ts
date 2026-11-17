import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
export async function databaseFixture() {
  const database = new PGlite();
  await database.exec(
    "create role anon;create role authenticated;create role service_role;",
  );
  for (const file of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await database.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  await database.exec(readFileSync("supabase/seed.sql", "utf8"));
  return database;
}
const identifier = (name: string) => {
  if (!/^[a-z_][a-z_0-9]*$/.test(name))
    throw new Error("Invalid fixture identifier");
  return `"${name}"`;
};
export function postgresAdapter(database: PGlite, auth: unknown) {
  return {
    auth,
    async rpc(name: string, args: Record<string, unknown> = {}) {
      try {
        const entries = Object.entries(args);
        const result = await database.query<{ value: unknown }>(
          `select public.${identifier(name)}(${entries.map(([k], i) => `${identifier(k)} => $${i + 1}`).join(",")}) value`,
          entries.map(([, v]) =>
            v && typeof v === "object" ? JSON.stringify(v) : v,
          ),
        );
        return { data: result.rows[0].value, error: null };
      } catch (e: any) {
        console.error("fixture", e.message);
        return { data: null, error: { code: e.code, message: e.message } };
      }
    },
    from(table: string) {
      const clauses: string[] = [],
        values: unknown[] = [];
      let mutation: Record<string, unknown> | undefined,
        mode = "select",
        single = false,
        limit = 1000,
        offset = 0,
        countRequested = false,
        sort = "";
      const bind = (value: unknown) => {
        values.push(
          value && typeof value === "object" ? JSON.stringify(value) : value,
        );
        return `$${values.length}`;
      };
      const b: any = {
        select: (_columns?: string, options?: { count?: string }) => {
          countRequested = options?.count === "exact";
          return b;
        },
        range: (start: number, end: number) => {
          offset = start;
          limit = end - start + 1;
          return b;
        },
        eq: (k: string, v: unknown) => {
          clauses.push(`${identifier(k)}=${bind(v)}`);
          return b;
        },
        is: (k: string, v: unknown) => {
          clauses.push(
            `${identifier(k)} is ${v === null ? "null" : "not null"}`,
          );
          return b;
        },
        or: (expression: string) => {
          clauses.push(
            "(" +
              expression
                .split(",")
                .map((clause) => {
                  const [key, op, ...rest] = clause.split(".");
                  if (op !== "eq") throw Error("Unsupported fixture op");
                  return `${identifier(key)}=${bind(rest.join("."))}`;
                })
                .join(" or ") +
              ")",
          );
          return b;
        },
        in: (k: string, v: unknown[]) => {
          clauses.push(`${identifier(k)} in (${v.map(bind).join(",")})`);
          return b;
        },
        order: (k: string, opts?: { ascending?: boolean }) => {
          sort += `${sort ? "," : " order by "}${identifier(k)} ${opts?.ascending === false ? "desc" : "asc"}`;
          return b;
        },
        limit: (n: number) => {
          limit = n;
          return b;
        },
        maybeSingle: () => {
          single = true;
          return b;
        },
        single: () => {
          single = true;
          return b;
        },
        update: (v: Record<string, unknown>) => {
          mutation = v;
          mode = "update";
          return b;
        },
        insert: (v: Record<string, unknown>) => {
          mutation = v;
          mode = "insert";
          return b;
        },
        upsert: (v: Record<string, unknown>, opts?: unknown) => {
          mutation = v;
          mode = "upsert";
          return b;
        },
        then: (resolve: any, reject: any) => {
          async function execute() {
            try {
              let sql: string;
              if (mode === "select")
                sql = `select * from public.${identifier(table)}`;
              else if (mode === "update")
                sql = `update public.${identifier(table)} set ${Object.entries(
                  mutation!,
                )
                  .map(([k, v]) => `${identifier(k)}=${bind(v)}`)
                  .join(",")}`;
              else
                sql = `insert into public.${identifier(table)}(${Object.keys(mutation!).map(identifier).join(",")}) values(${Object.values(mutation!).map(bind).join(",")})${mode === "upsert" ? " on conflict do nothing" : ""}`;
              if (clauses.length) sql += " where " + clauses.join(" and ");
              const count =
                countRequested && mode === "select"
                  ? (
                      await database.query<{ count: number }>(
                        `select count(*)::integer count from public.${identifier(table)}${clauses.length ? " where " + clauses.join(" and ") : ""}`,
                        values,
                      )
                    ).rows[0].count
                  : undefined;
              if (mode === "select")
                sql += sort + ` limit ${limit} offset ${offset}`;
              else sql += " returning *";
              const result = await database.query(sql, values);
              return {
                count,
                data: single ? result.rows[0] || null : result.rows,
                error: null,
              };
            } catch (e: any) {
              console.error("fixture", e.message);
              return {
                data: null,
                error: { code: e.code, message: e.message },
              };
            }
          }
          return execute().then(resolve, reject);
        },
      };
      return b;
    },
  };
}
