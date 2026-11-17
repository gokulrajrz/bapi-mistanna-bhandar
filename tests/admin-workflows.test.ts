import { beforeAll, afterAll, it, expect } from "vitest";
import { databaseFixture } from "./support/database";
import {
  arrayItem,
  orderArray,
  numericRule,
  toIndiaInput,
  fromIndiaInput,
  imagePath,
} from "../src/components/admin/fields";
import { settingsSchemas } from "../shared/admin-schema";
import { defaultStorefront } from "../shared/storefront-defaults";
let db: Awaited<ReturnType<typeof databaseFixture>>;
const owner = "00000000-0000-4000-8000-000000000001",
  manager = "00000000-0000-4000-8000-000000000002";
async function rpc(name: string, args: unknown[]) {
  return (
    await db.query<{ result: any }>(
      `select public.${name}(${args.map((_, i) => "$" + (i + 1)).join(",")}) result`,
      args.map((v) => (typeof v === "object" ? JSON.stringify(v) : v)),
    )
  ).rows[0].result;
}
beforeAll(async () => {
  db = await databaseFixture();
  await db.query(
    "insert into public.admin_users values ($1,'owner'),($2,'manager')",
    [owner, manager],
  );
});
afterAll(async () => db.close());
it("creates correctly typed nested entries even after arrays become empty", () => {
  const data = structuredClone(defaultStorefront);
  data.experience.prices = [
    arrayItem("storefront.experience.prices") as number,
  ];
  data.experience.footerColumns = [
    arrayItem("storefront.experience.footerColumns") as any,
  ];
  data.experience.footerColumns[0].links.push(
    arrayItem("storefront.experience.footerColumns.0.links") as any,
  );
  data.pages.giftingCards = [arrayItem("storefront.pages.giftingCards") as any];
  expect(settingsSchemas.storefront.safeParse(data).success).toBe(true);
  expect(numericRule("commerce.boxSizes.0")).toMatchObject({
    numeric: true,
    step: "1",
    max: 48,
  });
  expect(numericRule("variants.0.stock").step).toBe("1");
  expect(fromIndiaInput(toIndiaInput("2026-09-29T10:00:00Z"))).toBe(
    "2026-09-29T10:00:00.000Z",
  );
  expect(imagePath("storefront.home.introductionImage")).toBe(true);
  expect(imagePath("storefront.heroTitle")).toBe(false);
});
it("searches before pagination and applies status, method, date and stable sorting", async () => {
  for (let i = 0; i < 56; i++)
    await db.query(
      "insert into public.orders(id,request_id,payload_hash,subtotal,shipping,discount,contact,total,status,created_at) values(gen_random_uuid(),gen_random_uuid(),'fixture',100,0,0,$1,100,'preparing',$2)",
      [
        JSON.stringify({
          name: i === 55 ? "Needle customer" : "Other customer",
          method: i % 2 ? "pickup" : "delivery",
        }),
        `2026-09-${String(1 + (i % 28)).padStart(2, "0")}T00:00:00Z`,
      ],
    );
  const found = await rpc("admin_list", [
    "orders",
    { q: "Needle customer", page: 1 },
    owner,
  ]);
  expect(found.total).toBe(1);
  expect(found.items[0].contact.name).toBe("Needle customer");
  const filtered = await rpc("admin_list", [
    "orders",
    {
      status: "preparing",
      method: "delivery",
      from: "2026-09-01",
      to: "2026-09-03",
    },
    owner,
  ]);
  expect(filtered.total).toBe(4);
  const first = await rpc("admin_list", ["orders", { page: 1 }, owner]),
    second = await rpc("admin_list", ["orders", { page: 2 }, owner]);
  expect(first.items).toHaveLength(50);
  expect(second.items).toHaveLength(6);
  expect(new Set([...first.items, ...second.items].map((x) => x.id)).size).toBe(
    56,
  );
  const products = await rpc("admin_list", ["products", {}, owner]);
  expect(products.items[0].product_variants.length).toBeGreaterThan(0);
  expect(products.items[0].inventory.pieces).toBeTypeOf("number");
  await expect(rpc("admin_list", ["settings", {}, manager])).rejects.toThrow(
    "Owner access",
  );
  await expect(rpc("admin_list", ["users", {}, manager])).rejects.toThrow(
    "Owner access",
  );
  await expect(rpc("admin_list", ["auth.users", {}, owner])).rejects.toThrow(
    "Unknown admin",
  );
});
it("enforces fulfilment transitions and retains shipment tracking on completion", async () => {
  const pick = (
    await db.query<{ id: string }>(
      "select id from public.orders where contact->>'method'='pickup' limit 1",
    )
  ).rows[0].id;
  await expect(
    rpc("transition_order", [pick, "shipped", {}, manager]),
  ).rejects.toThrow("fulfilment");
  await rpc("transition_order", [pick, "ready_for_pickup", null, manager]);
  const delivery = (
    await db.query<{ id: string }>(
      "select id from public.orders where contact->>'method'='delivery' limit 1",
    )
  ).rows[0].id;
  await expect(
    rpc("transition_order", [delivery, "ready_for_pickup", {}, manager]),
  ).rejects.toThrow("fulfilment");
  await rpc("transition_order", [
    delivery,
    "shipped",
    { reference: "TRACK123" },
    manager,
  ]);
  await rpc("transition_order", [delivery, "completed", null, manager]);
  expect(
    (
      await db.query<{ tracking: any }>(
        "select tracking from public.orders where id=$1",
        [delivery],
      )
    ).rows[0].tracking.reference,
  ).toBe("TRACK123");
});
it("synchronizes store contact and pickup settings atomically", async () => {
  const store = {
    revision:
      (await rpc("admin_list", ["stores", {}, owner])).items[0]?.revision ?? 0,
    id: "main",
    name: "Bapi Mistanna Bhandar",
    address: "Mancotta Road",
    phone: "+919876543210",
    hours: {},
    pickup_enabled: true,
    data: {
      image: "",
      hours: "9am–8pm",
      pickupInstructions: "Collect at counter",
    },
  };
  await rpc("admin_write", ["stores", store, manager]);
  const settings = await rpc("admin_list", ["settings", {}, owner]);
  expect(settings.items.find((x) => x.key === "public").value).toMatchObject({
    phone: store.phone,
    hours: "9am–8pm",
  });
  const commerce = settings.items.find((x) => x.key === "commerce");
  expect(commerce.value.pickupEnabled).toBe(true);
  commerce.value.pickupEnabled = false;
  await rpc("admin_write", ["settings", commerce, owner]);
  expect(
    (await rpc("admin_list", ["stores", {}, owner])).items[0].pickup_enabled,
  ).toBe(false);
});
it("revokes staff access, audits it and protects the last owner", async () => {
  await expect(rpc("revoke_admin_access", [manager, owner])).rejects.toThrow(
    "Owner access",
  );
  await expect(rpc("revoke_admin_access", [owner, owner])).rejects.toThrow(
    "last owner",
  );
  await rpc("revoke_admin_access", [owner, manager]);
  await expect(rpc("admin_list", ["orders", {}, manager])).rejects.toThrow(
    "Administrator access",
  );
  await expect(
    rpc("admin_write", [
      "admin_users",
      { user_id: owner, role: "manager" },
      owner,
    ]),
  ).rejects.toThrow("last owner");
  const log = await rpc("admin_list", [
    "admin_audit",
    { q: "revoke:admin_users" },
    owner,
  ]);
  expect(log.total).toBe(1);
  const grants = await db.query<{ allowed: boolean }>(
    "select has_function_privilege('authenticated','public.revoke_admin_access(uuid,uuid)','execute') allowed",
  );
  expect(grants.rows[0].allowed).toBe(false);
});

it("resolves authorized account identities without exposing auth internals", async () => {
  await db.exec(
    "create schema auth;create table auth.users(id uuid primary key,email text,encrypted_password text)",
  );
  await db.query(
    "insert into auth.users values($1,'owner@example.test','never-return-this')",
    [owner],
  );
  const result = await rpc("admin_list", [
    "users",
    { q: "owner@example.test" },
    owner,
  ]);
  expect(result.items[0].person.email).toBe("owner@example.test");
  expect(JSON.stringify(result)).not.toContain("never-return-this");
  const selected = await rpc("admin_list", [
    "products",
    { q: "does-not-match", selected: "sweet-1" },
    owner,
  ]);
  expect(selected.items.map((x) => x.id)).toContain("sweet-1");
});

it("rejects stale snapshots across synchronized settings without partial changes", async () => {
  const list = async (resource: string) =>
    (await rpc("admin_list", [resource, {}, owner])).items;
  const staleCommerce = (await list("settings")).find(
    (r) => r.key === "commerce",
  );
  const store = (await list("stores"))[0];
  store.pickup_enabled = !staleCommerce.value.pickupEnabled;
  await rpc("admin_write", ["stores", store, owner]);
  staleCommerce.value.wrapFee += 1;
  await expect(
    rpc("admin_write", ["settings", staleCommerce, owner]),
  ).rejects.toThrow("changed while you were editing");
  expect((await list("stores"))[0].pickup_enabled).toBe(store.pickup_enabled);
  const staleStore = (await list("stores"))[0];
  const publicSettings = (await list("settings")).find(
    (r) => r.key === "public",
  );
  publicSettings.value.phone = "+919999999999";
  await rpc("admin_write", ["settings", publicSettings, owner]);
  staleStore.data.hours = "Old snapshot new hours";
  await expect(
    rpc("admin_write", ["stores", staleStore, owner]),
  ).rejects.toThrow("changed while you were editing");
  expect((await list("stores"))[0].phone).toBe("+919999999999");
  const current = (await list("settings")).find((r) => r.key === "commerce");
  await rpc("admin_write", ["settings", current, owner]);
  await expect(
    rpc("admin_write", ["settings", current, owner]),
  ).rejects.toThrow("changed while you were editing");
  const withoutVersion = { ...current };
  delete withoutVersion.revision;
  await expect(
    rpc("admin_write", ["settings", withoutVersion, owner]),
  ).rejects.toThrow("changed while you were editing");
});

it("persists reordered variant positions through the database", async () => {
  const product = (
    await rpc("admin_list", ["products", { q: "sweet-1" }, owner])
  ).items.find((p) => p.id === "sweet-1");
  const variants = product.product_variants.filter((v) => v.active);
  expect(variants.length).toBeGreaterThan(1);
  const reordered = orderArray("variants", [...variants].reverse());
  await rpc("admin_write", [
    "products",
    { ...product, variants: reordered },
    owner,
  ]);
  const saved = (
    await rpc("admin_list", ["products", { q: "sweet-1" }, owner])
  ).items.find((p) => p.id === "sweet-1");
  expect(
    saved.product_variants.filter((v) => v.active).map((v) => v.id),
  ).toEqual([...variants].reverse().map((v) => v.id));
});
