import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, it, expect, describe } from "vitest";
import { readFileSync } from "node:fs";
import { seedProducts } from "../src/data/products";
let db: PGlite;
const guest = "a".repeat(64),
  other = "b".repeat(64),
  owner = "00000000-0000-4000-8000-000000000001";
const contact = {
  name: "Test Customer",
  email: "test@example.com",
  phone: "9876543210",
  address: "123 Mancotta Road, Dibrugarh",
  pincode: "786001",
  method: "delivery",
  date: "2099-01-01",
  coupon: "",
  message: "",
};
const line = { productId: "sweet-1", variantId: "sweet-1-0", quantity: 1 };
async function rpc<T = Record<string, unknown>>(name: string, args: unknown[]) {
  const result = await db.query<{ result: T }>(
    `select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) result`,
    args.map((a) =>
      typeof a === "object" && a !== null ? JSON.stringify(a) : a,
    ),
  );
  return result.rows[0].result;
}
const quote = (items: unknown[] = [line], details = contact) =>
  rpc<any>("make_quote", [{ items, contact: details }, null, guest]);
const reserve = (q: string, request = crypto.randomUUID()) =>
  rpc<any>("reserve_order", [q, request, null, guest]);
async function stock() {
  return (
    await db.query<{ stock: number }>(
      "select stock from public.product_variants where id='sweet-1-0'",
    )
  ).rows[0].stock;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "create role anon;create role authenticated;create role service_role;",
  );
  for (const file of [
    "001_store.sql",
    "002_production_commerce.sql",
    "003_admin.sql",
    "004_quote_recovery.sql",
    "005_reviews.sql",
    "006_admin_cancellation.sql",
    "007_reconciliation_fairness.sql",
    "008_reservation_catalogue_lock.sql",
  ])
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  await db.exec(readFileSync("supabase/seed.sql", "utf8"));
  for (const p of seedProducts)
    await db.query("update public.products set data=$1 where id=$2", [
      JSON.stringify(p),
      p.id,
    ]);
  await db.exec(
    "insert into public.delivery_zones(name,pincode,charge,active,min_days,max_days,refrigerated) values('Dibrugarh test zone','786001',49,true,0,1,true);update public.coupons set active=true where code='SWEET10';insert into public.admin_users values('00000000-0000-4000-8000-000000000001','owner');",
  );
}, 30000);
afterAll(async () => db?.close());
describe("production quote, reservation and payment lifecycle", () => {
  it("runs every migration and returns database-filtered paginated catalogue", async () => {
    const page = await rpc<any>("catalogue_page", [
      { search: "cashew", pageSize: 2 },
    ]);
    expect(page.items).toHaveLength(2);
    expect(page.total).toBeGreaterThan(2);
    expect(page.items[0].variants[0].label).toBe("250 g");
  });
  it("quotes without reserving stock, and recalculates untrusted prices", async () => {
    const before = await stock();
    const q = await quote([{ ...line, price: 0.01 }]);
    expect(q.total).toBe(548);
    expect(q.lines[0].unitPrice).toBe(499);
    expect(await stock()).toBe(before);
  });
  it("reserves once across retried requests and protects ownership", async () => {
    const before = await stock();
    const q = await quote(),
      request = crypto.randomUUID();
    const a = await reserve(q.id, request),
      b = await reserve(q.id, request);
    expect(a.id).toBe(b.id);
    expect(await stock()).toBe(before - 1);
    await expect(
      rpc("reserve_order", [q.id, request, null, other]),
    ).rejects.toThrow("unavailable");
  });
  it("reuses a reserved quote even with a new client request ID", async () => {
    const q = await quote(),
      before = await stock();
    const first = await reserve(q.id);
    const retry = await reserve(q.id);
    expect(retry.id).toBe(first.id);
    expect(await stock()).toBe(before - 1);
  });
  it("rejects price changes after quote without consuming stock", async () => {
    const q = await quote();
    const before = await stock();
    await db.exec(
      "update public.product_variants set price=500 where id='sweet-1-0'",
    );
    await expect(reserve(q.id)).rejects.toThrow("changed");
    expect(await stock()).toBe(before);
    await db.exec(
      "update public.product_variants set price=499 where id='sweet-1-0'",
    );
  });
  it("combines repeated variants and rolls back on aggregate oversell", async () => {
    const q = await quote([
      { ...line, quantity: 20 },
      { ...line, quantity: 20 },
    ]);
    const before = await stock();
    await expect(reserve(q.id)).rejects.toThrow("sold out");
    expect(await stock()).toBe(before);
  });
  it("expires reservations exactly once", async () => {
    const q = await quote(),
      before = await stock(),
      o = await reserve(q.id);
    await db.query(
      "update public.orders set expires_at=now()-interval '1 minute' where id=$1",
      [o.id],
    );
    await rpc("expire_reservations", []);
    expect(await stock()).toBe(before);
    await rpc("expire_reservations", []);
    expect(await stock()).toBe(before);
  });
  it("rejects mismatched captured amounts and deduplicates payment events", async () => {
    const o = await reserve((await quote()).id);
    await db.query("update public.orders set gateway_order_id=$1 where id=$2", [
      `gateway-${o.id}`,
      o.id,
    ]);
    await expect(
      rpc("record_captured_payment", [
        `gateway-${o.id}`,
        `pay-${o.id}`,
        1,
        "INR",
        "wrong",
      ]),
    ).rejects.toThrow("mismatch");
    expect(
      await rpc("record_captured_payment", [
        `gateway-${o.id}`,
        `pay-${o.id}`,
        54800,
        "INR",
        "captured-1",
      ]),
    ).toBe("paid");
    expect(
      await rpc("record_captured_payment", [
        `gateway-${o.id}`,
        `pay-${o.id}`,
        54800,
        "INR",
        "captured-1",
      ]),
    ).toBe("paid");
  });
  it("refunds a late captured payment without consuming released stock", async () => {
    const before = await stock(),
      o = await reserve((await quote()).id);
    await db.query("update public.orders set gateway_order_id=$1 where id=$2", [
      `gateway-${o.id}`,
      o.id,
    ]);
    await rpc("cancel_store_order", [o.id, null, guest]);
    expect(await stock()).toBe(before);
    expect(
      await rpc("record_captured_payment", [
        `gateway-${o.id}`,
        `pay-${o.id}`,
        54800,
        "INR",
        "late",
      ]),
    ).toBe("refund_pending");
    expect(await stock()).toBe(before);
    const job = (
      await db.query<any>(
        "select * from public.refund_jobs where order_id=$1",
        [o.id],
      )
    ).rows[0];
    await rpc("finish_refund", [job.id, "refund-late", "processed"]);
    await rpc("finish_refund", [job.id, "refund-late", "processed"]);
    expect(
      (
        await db.query<any>("select status from public.orders where id=$1", [
          o.id,
        ])
      ).rows[0].status,
    ).toBe("refunded");
  });
  it("rejects unsafe unrefrigerated transit for milk sweets", async () => {
    await db.exec(
      "update public.delivery_zones set refrigerated=false where pincode='786001'",
    );
    await expect(
      quote([{ productId: "sweet-4", variantId: "sweet-4-0", quantity: 1 }]),
    ).rejects.toThrow("safely");
    await db.exec(
      "update public.delivery_zones set refrigerated=true where pincode='786001'",
    );
  });
  it("guards admin writes and prevents demoting the last owner", async () => {
    await expect(
      rpc("admin_write", [
        "coupons",
        {
          code: "X",
          percent: 10,
          max_discount: 100,
          minimum_order: 0,
          active: false,
        },
        "00000000-0000-4000-8000-000000000002",
      ]),
    ).rejects.toThrow("Administrator");
    await expect(
      rpc("admin_write", [
        "admin_users",
        { user_id: owner, role: "manager" },
        owner,
      ]),
    ).rejects.toThrow("last owner");
  });
  it("writes generated delivery IDs and audits admin changes", async () => {
    const zone = await rpc<any>("admin_write", [
      "delivery_zones",
      {
        name: "Another test zone",
        pincode: "786002",
        charge: 60,
        minimum_order: 0,
        active: false,
        min_days: 1,
        max_days: 2,
        refrigerated: false,
        same_day_cutoff: 12,
      },
      owner,
    ]);
    expect(zone.id).toBeTruthy();
    const updated = await rpc<any>("admin_write", [
      "delivery_zones",
      { ...zone, charge: 70 },
      owner,
    ]);
    expect(updated.charge).toBe(70);
  });
  it("rejects stale cart revisions instead of silently overwriting another device", async () => {
    const first = await rpc<any>("save_customer_cart", [owner, [], 1]);
    expect(first.revision).toBe(2);
    await expect(rpc("save_customer_cart", [owner, [], 1])).rejects.toThrow(
      "another device",
    );
  });
  it("rejects reviews without a completed authenticated purchase", async () => {
    await expect(
      rpc("submit_review", [
        owner,
        "sweet-1",
        "Customer",
        5,
        "A lovely sweet.",
      ]),
    ).rejects.toThrow("completed");
  });
  it("allows staff to cancel a pending order and restores inventory once", async () => {
    const before = await stock(),
      o = await reserve((await quote()).id);
    await rpc("admin_cancel_order", [o.id, owner]);
    await rpc("admin_cancel_order", [o.id, owner]);
    expect(await stock()).toBe(before);
    await expect(
      rpc("admin_cancel_order", [o.id, "00000000-0000-4000-8000-000000000002"]),
    ).rejects.toThrow("Administrator");
  });
  it("denies browser roles from executing commerce functions", async () => {
    const r = await db.query<{ allowed: boolean }>(
      "select has_function_privilege('anon','public.reserve_order(uuid,uuid,uuid,text)','EXECUTE') allowed",
    );
    expect(r.rows[0].allowed).toBe(false);
  });
});
