import { PGlite } from "@electric-sql/pglite";
import { it, expect } from "vitest";
import { databaseFixture } from "./support/database";
it("restores an embedded database backup with catalogue and RLS protections intact", async () => {
  const source = await databaseFixture();
  const before = await source.query(
    "select id,slug,revision from public.products order by id",
  );
  const dump = await source.dumpDataDir();
  await source.close();
  const restored = await PGlite.create({ loadDataDir: dump });
  expect(
    (
      await restored.query(
        "select id,slug,revision from public.products order by id",
      )
    ).rows,
  ).toEqual(before.rows);
  await restored.exec("set role anon");
  await expect(restored.query("select * from public.orders")).rejects.toThrow();
  await restored.exec("reset role");
  expect(
    (
      await restored.query<{ allowed: boolean }>(
        "select has_function_privilege('anon','public.reserve_order(uuid,uuid,uuid,text)','EXECUTE') allowed",
      )
    ).rows[0].allowed,
  ).toBe(false);
  await restored.close();
}, 30000);
