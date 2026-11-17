import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { databaseFixture, postgresAdapter } from "./support/database";
const fixture = vi.hoisted(() => ({ client: null as any }));
vi.mock("../server/supabase", async (original) => ({
  ...(await original<any>()),
  db: () => fixture.client,
}));
import { onRequestPost as quote } from "../functions/api/quote";
import { onRequestPost as checkout } from "../functions/api/checkout";
import { onRequestPost as payment } from "../functions/api/orders/[id]/payment";
import { onRequestPost as verify } from "../functions/api/payments/verify";
import { onRequestPost as webhook } from "../functions/api/payments/webhook";
import { onRequestPost as cancel } from "../functions/api/orders/[id]/cancel";
import { onRequestGet as order } from "../functions/api/orders/[id]";
import { onRequestGet as adminOrders } from "../functions/api/admin/orders";
import { onRequestPost as signIn } from "../functions/api/auth/verify";
import { onRequestGet as session } from "../functions/api/auth/session";
import { processRefund } from "../server/razorpay";
import type { Context } from "../server/supabase";
let database: PGlite;
const user = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002";
const env = {
  SUPABASE_URL: "https://fixture.test",
  SUPABASE_SERVICE_ROLE_KEY: "fixture",
  CHECKOUT_ENABLED: "true",
  RAZORPAY_KEY_ID: "rzp_test_fixture",
  RAZORPAY_KEY_SECRET: "fixture-payments",
  RAZORPAY_WEBHOOK_SECRET: "fixture-webhook",
  TURNSTILE_SECRET_KEY: "fixture-turnstile",
};
const providerOrders: any[] = [],
  providerPayments: any[] = [],
  providerRefunds: any[] = [];
function ctx(
  path: string,
  data?: unknown,
  token = "customer",
  params: Record<string, string> = {},
): Context {
  return {
    env,
    params,
    request: new Request("https://store.test" + path, {
      method: data === undefined ? "GET" : "POST",
      headers: {
        Origin: "https://store.test",
        "Content-Type": "application/json",
        Cookie: `bapi_access=${token}`,
        "CF-Connecting-IP": crypto.randomUUID(),
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    }),
  };
}
async function hmac(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return Array.from(
    new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)),
    ),
    (n) => n.toString(16).padStart(2, "0"),
  ).join("");
}
const payload = {
  items: [{ productId: "sweet-1", variantId: "sweet-1-0", quantity: 1 }],
  contact: {
    name: "Customer",
    email: "customer@example.com",
    phone: "9876543210",
    address: "123 Mancotta Road, Dibrugarh",
    pincode: "786001",
    method: "delivery",
    date: "2099-01-01",
    coupon: "",
    message: "",
  },
};
async function reserve() {
  const q = await quote(ctx("/api/quote", payload));
  expect(q.status).toBe(200);
  const quoted = (await q.json()) as any;
  const data = {
    quoteId: quoted.id,
    requestId: crypto.randomUUID(),
    turnstileToken: "fixture",
  };
  const created = await checkout(ctx("/api/checkout", data));
  expect(created.status).toBe(201);
  return { created: (await created.json()) as any, request: data };
}
beforeAll(async () => {
  database = await databaseFixture();
  await database.exec(
    `update public.settings set value=value||'{"launchApproved":true}' where key='public';update public.settings set value=value||'{"checkoutEnabled":true}' where key='operations';insert into public.delivery_zones(name,pincode,charge,active,min_days,max_days,refrigerated) values('Local test','786001',49,true,0,1,true);`,
  );
  const auth = {
    getUser: async (token: string) =>
      token === "expired"
        ? { data: { user: null }, error: { message: "Expired" } }
        : {
            data: {
              user: {
                id: token === "other" ? other : user,
                email: "customer@example.com",
              },
            },
            error: null,
          },
    refreshSession: async () => ({
      data: {
        user: { id: user },
        session: {
          access_token: "new-access",
          refresh_token: "new-refresh",
          expires_in: 3600,
        },
      },
      error: null,
    }),
    verifyOtp: async () => ({
      data: {
        user: { id: user },
        session: {
          access_token: "access",
          refresh_token: "refresh",
          expires_in: 3600,
        },
      },
      error: null,
    }),
  };
  fixture.client = postgresAdapter(database, auth);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.hostname === "challenges.cloudflare.com")
        return Response.json({
          success: true,
          action: "checkout",
          hostname: "store.test",
        });
      if (url.hostname !== "api.razorpay.com")
        throw Error("Unexpected external request");
      if (url.pathname === "/v1/orders" && init?.method === "POST") {
        const p = JSON.parse(String(init.body));
        const result = {
          ...p,
          id: `order_${providerOrders.length + 1}`,
          status: "created",
        };
        providerOrders.push(result);
        return Response.json(result);
      }
      if (url.pathname === "/v1/orders")
        return Response.json({
          items: providerOrders.filter(
            (o) => o.receipt === url.searchParams.get("receipt"),
          ),
        });
      if (url.pathname.endsWith("/refund") && init?.method === "POST") {
        const p = JSON.parse(String(init.body));
        const result = {
          ...p,
          id: `rfnd_${providerRefunds.length + 1}`,
          payment_id: url.pathname.split("/")[3],
          status: "processed",
        };
        providerRefunds.push(result);
        return Response.json(result);
      }
      if (url.pathname.endsWith("/refunds"))
        return Response.json({ items: providerRefunds });
      return Response.json(
        providerPayments.find((p) => url.pathname.endsWith("/" + p.id)),
      );
    }),
  );
}, 30000);
afterAll(async () => {
  vi.unstubAllGlobals();
  await database.close();
});
it("sets HttpOnly OTP cookies without exposing tokens in the response", async () => {
  const res = await signIn(
    ctx("/api/auth/verify", { email: "customer@example.com", token: "123456" }),
  );
  expect(res.status).toBe(200);
  expect(res.headers.get("set-cookie")).toContain("HttpOnly");
  expect(await res.text()).not.toContain("refresh_token");
});
it("refreshes an expired session and returns rotated cookies", async () => {
  const context = ctx("/api/auth/session", undefined, "expired");
  context.request = new Request(context.request, {
    headers: { Cookie: "bapi_access=expired; bapi_refresh=refresh" },
  });
  const res = await session(context);
  expect(res.status).toBe(200);
  expect(res.headers.get("set-cookie")).toContain("new-refresh");
});
it("rejects a customer accessing staff endpoints", async () => {
  expect((await adminOrders(ctx("/api/admin/orders"))).status).toBe(403);
});
it("runs quote → reservation → recovery through the real BFF handlers", async () => {
  const r = await reserve();
  const retry = await checkout(
    ctx("/api/checkout", { ...r.request, turnstileToken: "" }),
  );
  expect(retry.status).toBe(200);
  expect(((await retry.json()) as any).id).toBe(r.created.id);
  expect(
    (
      await order(
        ctx(`/api/orders/${r.created.id}`, undefined, "other", {
          id: r.created.id,
        }),
      )
    ).status,
  ).toBe(404);
});
it("verifies captured payments, deduplicates webhooks, cancels and completes a refund", async () => {
  const { created } = await reserve();
  const intent = await payment(
    ctx(`/api/orders/${created.id}/payment`, {}, "customer", {
      id: created.id,
    }),
  );
  expect(intent.status).toBe(200);
  const gateway = (await intent.json()) as any;
  const p = {
    id: "pay_fixture1",
    order_id: gateway.orderId,
    amount: 54800,
    currency: "INR",
    status: "captured",
    amount_refunded: 0,
  };
  providerPayments.push(p);
  const signature = await hmac(
    env.RAZORPAY_KEY_SECRET,
    `${p.order_id}|${p.id}`,
  );
  const paid = await verify(
    ctx("/api/payments/verify", {
      orderId: created.id,
      razorpay_payment_id: p.id,
      razorpay_signature: signature,
    }),
  );
  expect(paid.status).toBe(200);
  expect(((await paid.json()) as any).status).toBe("paid");
  const raw = JSON.stringify({
    event: "payment.captured",
    payload: { payment: { entity: p } },
  });
  const webhookContext = {
    env,
    params: {},
    request: new Request("https://store.test/api/payments/webhook", {
      method: "POST",
      headers: {
        "X-Razorpay-Signature": await hmac(env.RAZORPAY_WEBHOOK_SECRET, raw),
        "X-Razorpay-Event-Id": "event1",
      },
      body: raw,
    }),
  };
  expect((await webhook(webhookContext)).status).toBe(200);
  expect(
    (
      await webhook({
        ...webhookContext,
        request: new Request(webhookContext.request.url, {
          method: "POST",
          headers: webhookContext.request.headers,
          body: raw,
        }),
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await cancel(
        ctx(`/api/orders/${created.id}/cancel`, {}, "customer", {
          id: created.id,
        }),
      )
    ).status,
  ).toBe(200);
  const job = (
    await database.query<any>(
      "select * from public.refund_jobs where order_id=$1",
      [created.id],
    )
  ).rows[0];
  await processRefund(env, job);
  expect(
    (
      await database.query<any>(
        "select status from public.orders where id=$1",
        [created.id],
      )
    ).rows[0].status,
  ).toBe("refunded");
  expect(providerRefunds).toHaveLength(1);
});
it("rejects a modified webhook body", async () => {
  const raw = "{}";
  const res = await webhook({
    env,
    params: {},
    request: new Request("https://store.test/api/payments/webhook", {
      method: "POST",
      headers: {
        "X-Razorpay-Signature": await hmac(env.RAZORPAY_WEBHOOK_SECRET, raw),
        "X-Razorpay-Event-Id": "tampered",
      },
      body: raw + " ",
    }),
  });
  expect(res.status).toBe(400);
});

it("estimates authoritative prices without creating quotes or reserving stock", async () => {
  const { onRequestPost: estimate } = await import("../functions/api/estimate");
  const before = await database.query(
    "select stock from public.product_variants where id='sweet-1-0'",
  );
  const quotes = await database.query(
    "select count(*) from public.checkout_quotes",
  );
  const response = await estimate(
    ctx("/api/estimate", {
      items: [{ ...payload.items[0], price: 1 }],
      contact: {
        method: "delivery",
        pincode: "786001",
        date: "2099-01-01",
        coupon: "",
      },
    }),
  );
  expect(response.status).toBe(200);
  const result = (await response.json()) as any;
  expect(result.subtotal).toBeGreaterThan(1);
  expect(result.total).toBe(
    result.subtotal + result.shipping - result.discount,
  );
  expect(result.demands).toBeUndefined();
  expect(
    (
      await database.query(
        "select stock from public.product_variants where id='sweet-1-0'",
      )
    ).rows,
  ).toEqual(before.rows);
  expect(
    (await database.query("select count(*) from public.checkout_quotes")).rows,
  ).toEqual(quotes.rows);
  const invalid = await estimate(
    ctx("/api/estimate", {
      items: payload.items,
      contact: {
        method: "delivery",
        pincode: "000000",
        date: "2099-01-01",
        coupon: "",
      },
    }),
  );
  expect(invalid.status).toBeGreaterThanOrEqual(400);
});
it("aggregates published reviews only and keeps the RPC private", async () => {
  await database.exec(
    "insert into public.reviews(product_id,name,rating,body,published) values ('sweet-1','A',5,'Great',true),('sweet-1','B',3,'Good',true),('sweet-1','C',1,'Pending',false)",
  );
  const { ratingSummaries } = await import("../server/ratings");
  expect(await ratingSummaries(env, ["sweet-1"])).toEqual({
    "sweet-1": { ratingCount: 2, ratingAverage: 4 },
  });
  expect(
    (
      await database.query<{ allowed: boolean }>(
        "select has_function_privilege('anon','public.product_rating_summary(jsonb)','EXECUTE') allowed",
      )
    ).rows[0].allowed,
  ).toBe(false);
});
it("indexes approved public pages with a canonical URL and rejects unknown routes", async () => {
  const { pageMetadata } = await import("../server/seo");
  const site = { ...env, SITE_URL: "https://bapi.example" };
  await database.exec(
    `update public.settings set value=jsonb_set(value,'{launchApproved}','false') where key='public'`,
  );
  expect((await pageMetadata(site, "/")).index).toBe(false);
  await database.exec(
    `update public.settings set value=jsonb_set(value,'{launchApproved}','true') where key='public'`,
  );
  const meta = await pageMetadata(site, "/");
  expect(meta.index).toBe(true);
  expect(meta.url).toBe("https://bapi.example/");
  expect(meta.schemas).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ "@type": "Organization" }),
    ]),
  );
  const missing = await pageMetadata(site, "/missing");
  expect(missing.status).toBe(404);
  expect(missing.index).toBe(false);
  await database.exec(
    `update public.settings set value=jsonb_set(value,'{launchApproved}','false') where key='public'`,
  );
});

it("paginates beyond 100 reviews with stable ties and excludes unpublished reviews", async () => {
  await database.exec(
    "insert into public.reviews(product_id,name,rating,body,published,created_at) select 'sweet-2','Reviewer '||n,5,'Review '||n,true,'2026-01-01T00:00:00Z' from generate_series(1,105) n; insert into public.reviews(product_id,name,rating,body,published) values ('sweet-2','Hidden',1,'Unpublished',false)",
  );
  const { onRequestGet } = await import("../functions/api/reviews/[id]");
  const ids: string[] = [];
  let cursor: { createdAt: string; id: string } | null = null;
  do {
    const query = cursor
      ? "?" +
        new URLSearchParams({ before: cursor.createdAt, beforeId: cursor.id })
      : "";
    const res = await onRequestGet(
      ctx("/api/reviews/sweet-2" + query, undefined, "customer", {
        id: "sweet-2",
      }),
    );
    expect(res.status).toBe(200);
    const page = (await res.json()) as any;
    expect(page.items.length).toBeLessThanOrEqual(20);
    expect(page.items.every((r: any) => r.name !== "Hidden")).toBe(true);
    ids.push(...page.items.map((r: any) => r.id));
    cursor = page.nextCursor;
  } while (cursor && ids.length < 200);
  expect(ids).toHaveLength(105);
  expect(new Set(ids).size).toBe(105);
  expect(
    (
      await onRequestGet(
        ctx("/api/reviews/sweet-2?before=invalid", undefined, "customer", {
          id: "sweet-2",
        }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await database.query<{ allowed: boolean }>(
        "select has_function_privilege('anon','public.review_page(text,timestamptz,uuid)','EXECUTE') allowed",
      )
    ).rows[0].allowed,
  ).toBe(false);
});

it("serves admin search and lookups through BFF and checks revocation authorization", async () => {
  const { onRequestGet: list, onRequestDelete: revoke } =
    await import("../functions/api/admin/[resource]");
  const { onRequestGet: lookup } =
    await import("../functions/api/admin/lookup");
  const { onRequestGet: history } =
    await import("../functions/api/admin/customers/[id]");
  await database.query(
    "insert into public.admin_users values($1,'owner'),($2,'manager')",
    [user, other],
  );
  const products = await list(
    ctx("/api/admin/products?q=Kaju", undefined, "customer", {
      resource: "products",
    }),
  );
  expect(products.status).toBe(200);
  const result = (await products.json()) as any;
  expect(result.total).toBeGreaterThan(0);
  expect(result.items[0].product_variants).toBeInstanceOf(Array);
  expect(
    (
      await list(
        ctx("/api/admin/settings", undefined, "other", {
          resource: "settings",
        }),
      )
    ).status,
  ).toBe(403);
  expect(
    (await lookup(ctx("/api/admin/lookup?kind=users", undefined, "other")))
      .status,
  ).toBe(403);
  expect(
    (await lookup(ctx("/api/admin/lookup?kind=products&q=Kaju"))).status,
  ).toBe(200);
  expect(
    (
      await list(
        ctx("/api/admin/products?page=Infinity", undefined, "customer", {
          resource: "products",
        }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await list(
        ctx(
          "/api/admin/products?from=2026-09-30&to=2026-09-01",
          undefined,
          "customer",
          { resource: "products" },
        ),
      )
    ).status,
  ).toBe(400);
  await database.query(
    "insert into public.customer_profiles(user_id,name) values($1,'History customer') on conflict do nothing",
    [user],
  );
  const customer = await history(
    ctx("/api/admin/customers/" + user + "?page=2", undefined, "customer", {
      id: user,
    }),
  );
  expect(customer.status).toBe(200);
  expect(((await customer.json()) as any).page).toBe(2);
  expect(
    (
      await revoke(
        ctx("/api/admin/admin_users", { user_id: user }, "other", {
          resource: "admin_users",
        }),
      )
    ).status,
  ).toBe(403);
  const crossOrigin = ctx(
    "/api/admin/admin_users",
    { user_id: other },
    "customer",
    { resource: "admin_users" },
  );
  crossOrigin.request.headers.set("Origin", "https://attacker.test");
  expect((await revoke(crossOrigin)).status).toBe(403);
  expect(
    (
      await revoke(
        ctx("/api/admin/admin_users", { user_id: other }, "customer", {
          resource: "admin_users",
        }),
      )
    ).status,
  ).toBe(200);
  expect(
    (await adminOrders(ctx("/api/admin/orders", undefined, "other"))).status,
  ).toBe(403);
});

it("paginates equal-timestamp customer orders deterministically through the BFF", async () => {
  const { onRequestGet: history } =
    await import("../functions/api/admin/customers/[id]");
  const customerId = "00000000-0000-4000-8000-000000000099";
  await database.query(
    "insert into public.customer_profiles(user_id,name) values($1,'Pagination fixture')",
    [customerId],
  );
  await database.query(
    "insert into public.orders(id,request_id,payload_hash,subtotal,shipping,discount,total,contact,status,user_id,created_at) select ('00000000-0000-4000-8001-'||lpad(i::text,12,'0'))::uuid,gen_random_uuid(),'fixture',100,0,0,100,'{}','completed',$1,'2026-09-30T00:00:00Z' from generate_series(1,105) i",
    [customerId],
  );
  const ids: string[] = [];
  for (let page = 1; page <= 3; page++) {
    const res = await history(
      ctx(
        `/api/admin/customers/${customerId}?page=${page}`,
        undefined,
        "customer",
        { id: customerId },
      ),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.ordersTotal).toBe(105);
    ids.push(...data.orders.map((o) => o.id));
  }
  expect(ids).toEqual([...ids].sort().reverse());
  expect(new Set(ids).size).toBe(105);
  const empty = await history(
    ctx(`/api/admin/customers/${customerId}?page=4`, undefined, "customer", {
      id: customerId,
    }),
  );
  expect(await empty.json()).toMatchObject({ orders: [], ordersTotal: 105 });
});
it("returns a conflict from the BFF when a settings revision is stale", async () => {
  const { onRequestGet: list, onRequestPut: save } =
    await import("../functions/api/admin/[resource]");
  const get = () =>
    list(
      ctx("/api/admin/settings", undefined, "customer", {
        resource: "settings",
      }),
    );
  const data = (await (await get()).json()) as any;
  const commerce = data.items.find((r) => r.key === "commerce");
  commerce.value.wrapFee += 1;
  expect(
    (
      await save(
        ctx("/api/admin/settings", commerce, "customer", {
          resource: "settings",
        }),
      )
    ).status,
  ).toBe(200);
  const conflict = await save(
    ctx("/api/admin/settings", commerce, "customer", { resource: "settings" }),
  );
  expect(conflict.status).toBe(409);
  expect(await conflict.json()).toMatchObject({
    error: expect.stringContaining("changed while you were editing"),
  });
});
