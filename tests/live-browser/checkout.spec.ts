import { test, expect, type Page } from "@playwright/test";
import { defaultStorefront } from "../../shared/storefront-defaults";
import { seedProducts } from "../../src/data/products";
const id = "00000000-0000-4000-8000-000000000001",
  quoteId = "00000000-0000-4000-8000-000000000002";
const contact = {
  name: "Test Customer",
  email: "customer@example.com",
  phone: "9876543210",
  address: "123 Mancotta Road, Dibrugarh",
  pincode: "786001",
  method: "delivery",
  date: "2099-01-01",
  coupon: "",
  message: "",
};
const content = {
  settings: {
    name: "Bapi Mistanna Bhandar",
    address: contact.address,
    phone: "",
    hours: "",
    policies: [],
    pickupInstructions: "",
    launchApproved: true,
  },
  commerce: {
    boxFee: 99,
    boxSizes: [6, 12, 18, 24],
    wrapFee: 49,
    freeShipping: 999,
    pickupEnabled: true,
  },
  storefront: defaultStorefront,
  operations: {
    checkoutEnabled: true,
    maintenanceMode: false,
    reviewSubmissions: true,
    bulkEnquiries: true,
  },
  categories: ["Nut sweets"],
  posts: [],
  collections: [],
  campaigns: [],
  store: null,
  paymentEnabled: true,
  turnstileSiteKey: "fixture-site",
};
async function fixture(
  page: Page,
  {
    loseResponse = false,
    role = null,
  }: { loseResponse?: boolean; role?: string | null } = {},
) {
  const requests: any[] = [],
    errors: string[] = [];
  let created = false,
    status = "pending_payment";
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    (window as any).turnstile = {
      render: (_el: any, o: any) => {
        setTimeout(() => o.callback("fixture-token"), 0);
        return "fixture";
      },
      remove: () => {},
      reset: () => {},
    };
    (window as any).Razorpay = class {
      options: any;
      constructor(o: any) {
        this.options = o;
      }
      on() {}
      open() {
        this.options.handler({
          razorpay_payment_id: "pay_fixture",
          razorpay_signature: "a".repeat(64),
        });
      }
    };
  });
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    const send = (data: any, status = 200) =>
      route.fulfill({ status, json: data });
    if (path === "/api/content") return send(content);
    if (path === "/api/auth/session")
      return send({ user: { id, email: contact.email }, role });
    if (path === "/api/account/cart") return send({ items: [], revision: 1 });
    if (path === "/api/account")
      return send({
        profile: { name: contact.name, phone: contact.phone },
        addresses: [],
        orders: [],
      });
    if (path === "/api/metadata")
      return send({
        title: "Bapi Mistanna Bhandar",
        description: "Mithai in Assam",
        url:
          "http://localhost:5175" + new URL(req.url()).searchParams.get("path"),
        image: "http://localhost:5175/images/hero.webp",
        schemas: [],
        index: true,
        status: 200,
      });
    if (path === "/api/products")
      return send({ items: seedProducts, total: 18, page: 1, pageSize: 48 });
    if (path === "/api/quote")
      return send({
        id: quoteId,
        expiresAt: new Date(Date.now() + 600000).toISOString(),
        subtotal: 499,
        shipping: 49,
        discount: 0,
        total: 548,
        lines: [
          {
            name: "Kaju Katli",
            image: "/images/hero.webp",
            productId: "sweet-1",
            variantId: "sweet-1-0",
            label: "250 g",
            quantity: 1,
            unitPrice: 499,
          },
        ],
        deliveryLabel: "Local delivery",
      });
    if (path === "/api/checkout") {
      requests.push(req.postDataJSON());
      const wasCreated = created;
      created = true;
      if (loseResponse && !wasCreated) return route.abort("failed");
      return send(
        { id, total: 548, status: "pending_payment" },
        wasCreated ? 200 : 201,
      );
    }
    if (path === `/api/orders/${id}/payment`)
      return send({
        key: "rzp_test_fixture",
        orderId: "order_fixture",
        amount: 54800,
        currency: "INR",
      });
    if (path === "/api/payments/verify") {
      status = "paid";
      return send({ status });
    }
    if (path === `/api/orders/${id}/cancel`) {
      status = "refund_pending";
      return send({ status });
    }
    if (path === `/api/orders/${id}`)
      return send({
        id,
        total: 548,
        subtotal: 499,
        shipping: 49,
        discount: 0,
        status,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 1200000).toISOString(),
        contact,
        items: [
          {
            snapshot: {
              name: "Kaju Katli",
              label: "250 g",
              image: "/images/hero.webp",
            },
            quantity: 1,
            unit_price: 499,
          },
        ],
        events: [],
      });
    return send({ error: "Unexpected fixture endpoint" }, 404);
  });
  return { requests, errors };
}
async function startCheckout(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Add Kaju Katli to bag" }).click();
  await page.getByRole("link", { name: "Continue to checkout" }).click();
  for (const [label, value] of [
    ["Full name", contact.name],
    ["Email address", contact.email],
    ["Mobile number", contact.phone],
    ["Delivery address", contact.address],
    ["Pincode", contact.pincode],
    ["Preferred delivery date", contact.date],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole("button", { name: "Review my order" }).click();
  await page.getByRole("button", { name: "Continue to payment" }).click();
}
test("non-demo checkout recovers a lost response with the same reference after reload", async ({
  page,
}) => {
  const f = await fixture(page, { loseResponse: true });
  await startCheckout(page);
  await expect(page.getByRole("alert")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Resume last checkout" }).click();
  await expect(page).toHaveURL(`/orders/${id}`);
  expect(f.requests).toHaveLength(2);
  expect(f.requests[0].requestId).toBe(f.requests[1].requestId);
  expect(f.errors).toEqual([]);
});
test("non-demo payment callback refreshes the order, clears purchased items and supports cancellation", async ({
  page,
}) => {
  const f = await fixture(page);
  await startCheckout(page);
  await expect(page).toHaveURL(`/orders/${id}`);
  await page.getByRole("button", { name: /Pay ₹548/ }).click();
  await expect(
    page.getByRole("heading", { name: "Payment confirmed." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel order", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Cancel|Confirm/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your refund is being processed." }),
  ).toBeVisible();
  expect(f.errors).toEqual([]);
});
test("customer session cannot open the admin workspace", async ({ page }) => {
  await fixture(page);
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Administrator access required." }),
  ).toBeVisible();
});

test("loads the next review page without losing existing reviews", async ({
  page,
}) => {
  await fixture(page);
  await page.route("**/api/products/kaju-katli", (route) =>
    route.fulfill({ json: seedProducts[0] }),
  );
  await page.route("**/api/reviews/sweet-1*", (route) => {
    const second = new URL(route.request().url()).searchParams.has("before");
    return route.fulfill({
      json: {
        items: [
          {
            id: second ? "second" : "first",
            name: second ? "Older reviewer" : "Newest reviewer",
            rating: 5,
            body: "A lovely selection of sweets.",
            created_at: "2026-01-01T00:00:00Z",
            verified: true,
          },
        ],
        nextCursor: second ? null : { createdAt: "2026-01-01T00:00:00Z", id },
      },
    });
  });
  await page.goto("/products/kaju-katli");
  await expect(
    page.getByText("Newest reviewer", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Load more reviews" }).click();
  await expect(page.getByText("Older reviewer", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Newest reviewer", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Load more reviews" }),
  ).toHaveCount(0);
});
