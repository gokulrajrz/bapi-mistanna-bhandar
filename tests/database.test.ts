import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
let db: PGlite;
const contact = {
  name: "Test Customer",
  email: "test@example.com",
  phone: "9876543210",
  address: "123 Test Road, Assam",
  pincode: "781001",
  method: "delivery",
  date: "2099-01-01",
  coupon: "",
  message: "",
};
const order = (items: unknown[], extra = {}) => ({
  requestId: crypto.randomUUID(),
  contact,
  items,
  ...extra,
});
const line = { productId: "sweet-1", variantId: "sweet-1-0", quantity: 1 };
async function submit(payload: unknown) {
  const result = await db.query<{
    order: { id: string; total: number; status: string };
  }>('select public.create_store_order($1::jsonb) as "order"', [
    JSON.stringify(payload),
  ]);
  return result.rows[0].order;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "create role anon; create role authenticated; create role service_role;",
  );
  await db.exec(readFileSync("supabase/migrations/001_store.sql", "utf8"));
  await db.exec(
    readFileSync("supabase/migrations/002_production_commerce.sql", "utf8"),
  );
  await db.exec(readFileSync("supabase/migrations/003_admin.sql", "utf8"));
  await db.exec(readFileSync("supabase/seed.sql", "utf8"));
  await db.exec(
    "insert into public.delivery_zones(name,pincode,charge,active) values ('Test local zone','781001',49,true); update public.coupons set active=true where code='SWEET10';",
  );
}, 30000);
afterAll(async () => {
  await db?.close();
});
describe("atomic Postgres order transaction", () => {
  it("ignores tampered browser prices and uses server price and shipping", async () => {
    const result = await submit(order([{ ...line, price: 1 }]));
    expect(Number(result.total)).toBe(548);
  });
  it("retries an identical checkout without decrementing inventory twice", async () => {
    const payload = order([line]);
    const first = await submit(payload),
      second = await submit(payload);
    expect(second.id).toBe(first.id);
    expect(
      (
        await db.query<{ stock: number }>(
          "select stock from public.product_variants where id='sweet-1-0'",
        )
      ).rows[0].stock,
    ).toBe(28);
  });
  it("rejects request-id reuse for a changed order", async () => {
    const payload = order([line]);
    await submit(payload);
    await expect(
      submit({ ...payload, items: [{ ...line, quantity: 2 }] }),
    ).rejects.toThrow("already used");
  });
  it("rolls all inventory changes back if a later line is unavailable", async () => {
    const before = (
      await db.query<{ stock: number }>(
        "select stock from public.product_variants where id='sweet-1-0'",
      )
    ).rows[0].stock;
    await expect(
      submit(order([line, { ...line, variantId: "missing" }])),
    ).rejects.toThrow("unavailable");
    const after = (
      await db.query<{ stock: number }>(
        "select stock from public.product_variants where id='sweet-1-0'",
      )
    ).rows[0].stock;
    expect(after).toBe(before);
  });
  it("validates a custom box and calculates its pieces, wrapping and coupon", async () => {
    const result = await submit(
      order(
        [
          {
            productId: "custom-box",
            variantId: "box-6",
            quantity: 1,
            box: { size: 6, pieces: { "sweet-1": 3, "sweet-2": 3 } },
            gift: { wrap: true },
          },
        ],
        { contact: { ...contact, coupon: "SWEET10" } },
      ),
    );
    expect(Number(result.total)).toBe(466);
  });
  it("rejects an incomplete box and unsupported delivery zone", async () => {
    await expect(
      submit(order([{ ...line, box: { size: 6, pieces: { "sweet-1": 1 } } }])),
    ).rejects.toThrow("fill every");
    await expect(
      submit(order([line], { contact: { ...contact, pincode: "999999" } })),
    ).rejects.toThrow("not yet available");
  });
});
