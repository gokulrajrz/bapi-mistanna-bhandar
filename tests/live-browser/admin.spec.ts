import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { defaultStorefront } from "../../shared/storefront-defaults";
const id = "00000000-0000-4000-8000-000000000001";
const product = {
  id: "sweet-1",
  slug: "kaju-katli",
  revision: 1,
  active: true,
  sort_order: 0,
  data: {
    name: "Kaju Katli",
    description: "Cashew sweets.",
    category: "Nut sweets",
    image: "/images/hero.webp",
    gallery: ["/images/hero.webp"],
    ingredients: ["Cashew"],
    allergens: ["Nuts"],
    tags: [],
    shelfLife: "5 days",
    shelfLifeDays: 5,
    requiresRefrigeration: false,
    featured: true,
    createdAt: "2026-01-01T00:00:00Z",
  },
  product_variants: [
    {
      id: "sweet-1-0",
      label: "250 g",
      price: 499,
      stock: 10,
      sort_order: 0,
      active: true,
      revision: 1,
    },
  ],
  inventory: { piece_price: 40, pieces: 100, revision: 1 },
};
const order = {
  id,
  total: 1347,
  status: "preparing",
  created_at: "2026-09-29T10:00:00Z",
  contact: { name: "Fixture Customer", method: "pickup", date: "2026-09-30" },
};
async function setup(
  page: Page,
  { role = "owner", healthFail = false, sessionFail = false } = {},
) {
  const writes: any[] = [],
    reads: string[] = [];
  let releaseUpload = () => {},
    releaseSave = () => {};
  const state = { slowUpload: false, slowSave: false };
  const rows: Record<string, any[]> = {
    products: [structuredClone(product)],
    orders: [structuredClone(order)],
    settings: [
      {
        key: "storefront",
        revision: 1,
        value: structuredClone(defaultStorefront),
      },
      {
        key: "commerce",
        revision: 1,
        value: {
          boxSizes: [6, 12],
          boxFee: 99,
          wrapFee: 49,
          freeShipping: 999,
          pickupEnabled: true,
          reservationMinutes: 20,
          pickupMinDays: 1,
          cancellationEnabled: true,
        },
      },
    ],
    customers: [
      {
        user_id: id,
        name: "Fixture Customer",
        phone: "9876543210",
        revision: 1,
        staff_notes: "",
      },
    ],
    admin_users: [
      {
        user_id: id,
        role: "manager",
        person: { name: "Team Member", email: "team@example.test" },
      },
    ],
    collections: [],
    festival_campaigns: [],
    admin_audit: [
      {
        id: 1,
        user_id: id,
        person: { email: "owner@example.test" },
        action: "save:products",
        resource: "sweet-1",
        created_at: order.created_at,
      },
    ],
    reviews: [
      {
        id,
        product_id: "sweet-1",
        product_name: "Kaju Katli",
        name: "Fixture Customer",
        body: "Fresh sweets",
        rating: 5,
        verified: true,
        published: false,
      },
    ],
    refund_jobs: [{ id, order_id: id, amount: 134700, status: "queued" }],
  };
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      u = new URL(req.url()),
      path = u.pathname;
    const send = (body: any, status = 200) =>
      route.fulfill({ status, json: body });
    reads.push(path + u.search);
    if (path === "/api/content")
      return send({
        settings: {
          name: "Bapi Mistanna Bhandar",
          address: "Mancotta Road",
          phone: "",
          hours: "",
          policies: [],
          pickupInstructions: "",
          launchApproved: false,
        },
        storefront: defaultStorefront,
        commerce: {
          boxSizes: [6, 12],
          boxFee: 99,
          wrapFee: 49,
          freeShipping: 999,
          pickupEnabled: true,
        },
        operations: {
          checkoutEnabled: false,
          maintenanceMode: false,
          reviewSubmissions: true,
          bulkEnquiries: true,
        },
        categories: [],
        posts: [],
        collections: [],
        campaigns: [],
        store: null,
        paymentEnabled: false,
      });
    if (path === "/api/account/cart") return send({ items: [], revision: 1 });
    if (path === "/api/auth/session")
      return send(
        sessionFail
          ? { error: "Session unavailable" }
          : { user: { id, email: "owner@example.test" }, role },
        sessionFail ? 503 : 200,
      );
    if (path === "/api/admin/status")
      return send(
        healthFail
          ? { error: "Health unavailable" }
          : {
              supabase: true,
              operationalHealth: {
                maintenance: {
                  status: "failed",
                  last_success_at: new Date().toISOString(),
                },
                overdueReservations: 0,
                refundsNeedingReview: 1,
                agedRefunds: 0,
              },
            },
        healthFail ? 503 : 200,
      );
    if (path === "/api/admin/upload") {
      if (state.slowUpload)
        await new Promise<void>((resolve) => {
          releaseUpload = resolve;
        });
      return send({ url: "/images/sweets.webp" });
    }
    if (path === "/api/admin/lookup")
      return send({
        items: [
          {
            id: u.searchParams.get("kind") === "users" ? id : "sweet-1",
            label:
              u.searchParams.get("kind") === "users"
                ? "Team Member · team@example.test"
                : "Kaju Katli",
          },
        ],
        total: 1,
      });
    if (path === "/api/admin/orders/" + id)
      return send({
        ...order,
        tracking: {
          carrier: "Courier",
          reference: "TRACK123",
          url: "https://example.test/track",
        },
        order_items: [
          {
            quantity: 2,
            unit_price: 1347,
            snapshot: {
              name: "Your signature mithai box",
              label: "12 handpicked pieces",
              boxItems: [
                { name: "Coconut laru", quantity: 6 },
                { name: "Kaju Katli", quantity: 6 },
              ],
              gift: { recipient: "Recipient", message: "Congratulations" },
            },
          },
        ],
        order_events: [],
      });
    if (path === "/api/admin/customers/" + id)
      return send({
        addresses: [],
        orders: u.searchParams.get("page") === "2" ? [] : [order],
        ordersTotal: 51,
      });
    const resource = path.split("/").at(-1)!;
    if (["PUT", "PATCH", "DELETE"].includes(req.method())) {
      const body = req.postDataJSON();
      writes.push({ path, body });
      if (state.slowSave)
        await new Promise<void>((resolve) => {
          releaseSave = resolve;
        });
      if (req.method() === "PUT") {
        const i = rows[resource]?.findIndex(
          (r) =>
            (r.key || r.id || r.user_id) ===
            (body.key || body.id || body.user_id),
        );
        if (i !== undefined && i >= 0) rows[resource][i] = body;
      }
      if (req.method() === "PATCH") rows.orders[0].status = body.status;
      return send({ updated: true });
    }
    if (path.startsWith("/api/admin/"))
      return send({
        items: (rows[resource] || []).map((r) =>
          resource === "products"
            ? {
                ...r,
                product_variants: [...(r.product_variants || r.variants)].sort(
                  (a, b) => a.sort_order - b.sort_order,
                ),
              }
            : r,
        ),
        total: rows[resource]?.length || 0,
        page: 1,
        pageSize: 50,
      });
    return send({});
  });
  return {
    writes,
    reads,
    state,
    releaseUpload: () => releaseUpload(),
    releaseSave: () => releaseSave(),
  };
}
async function edit(page: Page, section: string, record?: string) {
  await page.goto("/admin?section=" + section);
  const row = record
    ? page
        .getByRole("row")
        .filter({ has: page.getByText(record, { exact: true }) })
    : page
        .getByRole("row")
        .filter({
          has: page.getByRole("button", { name: "Edit", exact: true }),
        })
        .first();
  await row.getByRole("button", { name: "Edit", exact: true }).click();
}
test("typed array additions, nested footer links and empty-card recovery save valid values", async ({
  page,
}) => {
  const f = await setup(page);
  await edit(page, "settings", "commerce");
  await page.getByRole("button", { name: "Box sizes", exact: true }).click();
  await page
    .getByRole("button", { name: "+ Add boxSizes", exact: true })
    .click();
  await page
    .getByRole("spinbutton", { name: "Box sizes item 3", exact: true })
    .fill("18");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect.poll(() => f.writes.length).toBe(1);
  expect(f.writes[0].body.value.boxSizes).toEqual([6, 12, 18]);
  await edit(page, "settings", "storefront");
  await page
    .getByRole("button", { name: "Catalogue & footer", exact: true })
    .click();
  await page.getByRole("button", { name: "+ Add prices", exact: true }).click();
  const prices = page.getByRole("spinbutton", { name: /Prices item/ });
  await prices.last().fill("250");
  await page
    .getByRole("button", { name: "+ Add footerColumns", exact: true })
    .click();
  const col = page
    .locator("fieldset")
    .filter({ has: page.locator("legend", { hasText: "Footer columns" }) })
    .last()
    .locator(":scope > details")
    .last();
  await col.getByLabel("Title", { exact: true }).fill("Useful links");
  await col.getByRole("button", { name: "+ Add links", exact: true }).click();
  await col.getByLabel("Label", { exact: true }).fill("Shop");
  await page.getByRole("button", { name: "Pages", exact: true }).click();
  while (
    await page
      .getByRole("button", {
        name: /Remove storefront.pages.giftingCards item/,
      })
      .count()
  )
    await page
      .getByRole("button", {
        name: /Remove storefront.pages.giftingCards item/,
      })
      .last()
      .click();
  await page
    .getByRole("button", { name: "+ Add giftingCards", exact: true })
    .click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect.poll(() => f.writes.length).toBe(2);
  expect(f.writes[1].body.value.experience.prices.at(-1)).toBe(250);
  expect(
    f.writes[1].body.value.experience.footerColumns.at(-1).links[0],
  ).toEqual({ label: "Shop", to: "/shop" });
  expect(f.writes[1].body.value.pages.giftingCards[0]).toHaveProperty(
    "image",
    "",
  );
  await edit(page, "products");
  await page
    .getByRole("button", { name: "Product details", exact: true })
    .click();
  await page
    .getByRole("button", { name: "+ Add gallery", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Gallery item 2", exact: true })
    .fill("/images/sweets.webp");
  await page
    .getByRole("button", { name: "Move Gallery item 2 up", exact: true })
    .click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect.poll(() => f.writes.length).toBe(3);
  expect(f.writes[2].body.data.gallery).toEqual([
    "/images/sweets.webp",
    "/images/hero.webp",
  ]);
});
test("upload and save hold the editor busy; Escape cannot discard pending work", async ({
  page,
}) => {
  const f = await setup(page);
  await edit(page, "products");
  await page
    .getByRole("button", { name: "Product details", exact: true })
    .click();
  f.state.slowUpload = true;
  await page.getByLabel("Upload Image", { exact: true }).setInputFiles({
    name: "fixture.png",
    mimeType: "image/png",
    buffer: Buffer.from("fixture"),
  });
  await expect(
    page.getByRole("button", { name: "Save changes", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeVisible();
  f.releaseUpload();
  await expect(page.getByLabel("Image", { exact: true })).toHaveValue(
    "/images/sweets.webp",
  );
  f.state.slowSave = true;
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByLabel("Name", { exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeVisible();
  f.releaseSave();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(f.writes[0].body.data.image).toBe("/images/sweets.webp");
});
test("dirty changes require discard and invalid values focus the labelled field", async ({
  page,
}) => {
  await setup(page);
  await edit(page, "products");
  await expect(
    page.getByLabel("Reference · fixed reference", { exact: true }),
  ).toHaveAttribute("readonly", "");
  await page
    .getByRole("button", { name: "Product details", exact: true })
    .click();
  await page.getByLabel("Name", { exact: true }).fill("");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByLabel("Name", { exact: true })).toBeFocused();
  await expect(page.getByLabel("Name", { exact: true })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByText("Discard your unsaved changes?")).toBeVisible();
  await page.getByRole("button", { name: "Keep editing" }).click();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("mobile operations show packing, tracking and correct fulfilment choices", async ({
  page,
}) => {
  const f = await setup(page);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/admin?section=orders");
  await expect(
    page.getByRole("button", { name: "Open admin sections" }),
  ).toBeVisible();
  const status = page.getByLabel("Next order status");
  expect(await status.boundingBox()).toMatchObject({
    width: expect.any(Number),
  });
  expect((await status.boundingBox())!.width).toBeGreaterThan(200);
  await expect(status.locator("option[value=shipped]")).toHaveCount(0);
  await status.selectOption("ready_for_pickup");
  await page.getByRole("button", { name: "Update order" }).click();
  await expect(status).toHaveValue("");
  await page.getByRole("button", { name: /View #/ }).click();
  await expect(
    page.getByText("Coconut laru · 6 pieces per box · 12 pieces total"),
  ).toBeVisible();
  await expect(page.getByText("Courier · TRACK123")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Track shipment" }),
  ).toHaveAttribute("href", "https://example.test/track");
  expect(f.writes[0].body.status).toBe("ready_for_pickup");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});
test("search and filters reach BFF, customer history has links and pagination", async ({
  page,
}) => {
  const f = await setup(page);
  await page.goto("/admin?section=orders");
  await page.getByLabel("Search all records").fill("older order");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect
    .poll(() => f.reads.some((s) => s.includes("q=older+order")))
    .toBe(true);
  await page
    .getByRole("combobox", { name: "Fulfilment", exact: true })
    .selectOption("pickup");
  await expect(page).toHaveURL(/method=pickup/);
  await page.goto("/admin?section=customers");
  await page.getByRole("button", { name: "Addresses & orders" }).click();
  await expect(page.getByText("No saved addresses.")).toBeVisible();
  await page.getByRole("button", { name: /View order #/ }).click();
  await expect(page.getByRole("dialog", { name: /Order #/ })).toBeVisible();
  await page
    .getByRole("dialog", { name: /Order #/ })
    .getByLabel("Close dialog")
    .click();
  await page.getByRole("button", { name: "Next orders" }).click();
  await expect
    .poll(() => f.reads.includes("/api/admin/customers/" + id + "?page=2"))
    .toBe(true);
  await expect(page.getByText("No orders on this page.")).toBeVisible();
  await page.getByRole("button", { name: "Return to first page" }).click();
  await expect(
    page.getByRole("button", { name: /View order #/ }),
  ).toBeVisible();
});
test("staff are identifiable and revocation requires an explicit confirmation", async ({
  page,
}) => {
  const f = await setup(page);
  await page.goto("/admin?section=admin_users");
  await expect(
    page.getByText("team@example.test", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Revoke access", exact: true })
    .click();
  expect(f.writes).toHaveLength(0);
  await page.getByRole("button", { name: "Confirm revocation" }).click();
  await expect.poll(() => f.writes.length).toBe(1);
  expect(f.writes[0].body.user_id).toBe(id);
});
test("manager deep links are gated before fetching owner resources", async ({
  page,
}) => {
  const f = await setup(page, { role: "manager" });
  await page.goto("/admin?section=settings");
  await expect(
    page.getByText("This section requires an owner account.", { exact: false }),
  ).toBeVisible();
  expect(f.reads.some((s) => s.startsWith("/api/admin/settings"))).toBe(false);
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toBeVisible();
});
test("health failure stays unknown and a failed heartbeat is explicit", async ({
  page,
}) => {
  await setup(page, { healthFail: true });
  await page.goto("/admin");
  await expect(page.getByText("Unable to check", { exact: true })).toHaveCount(
    6,
  );
  await page.unroute("**/api/**");
  await setup(page);
  await page.reload();
  await expect(
    page.getByText("The latest maintenance run failed.", { exact: false }),
  ).toBeVisible();
});
test("session failures are distinct from sign-in", async ({ page }) => {
  await setup(page, { sessionFail: true });
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Could not verify your session" }),
  ).toBeVisible();
});

test("relationship selectors use readable BFF choices and scheduling uses India time", async ({
  page,
}) => {
  const f = await setup(page);
  await page.goto("/admin?section=festival_campaigns");
  await page.getByRole("button", { name: "Add festival" }).click();
  await page
    .getByRole("combobox", { name: "Collection", exact: true })
    .selectOption("sweet-1");
  await page.getByLabel("Starts (India time)").fill("2026-10-01T09:30");
  await page.getByLabel("Ends (India time)").fill("2026-10-02T18:00");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect.poll(() => f.writes.length).toBe(1);
  expect(f.writes[0].body.starts_at).toBe("2026-10-01T04:00:00.000Z");
  expect(f.writes[0].body.collection_id).toBe("sweet-1");
  await page.goto("/admin?section=admin_users");
  await page.getByRole("button", { name: "Add team" }).click();
  await expect(
    page.getByRole("combobox", { name: "Team member", exact: true }),
  ).toContainText("Team Member · team@example.test");
  await page
    .getByRole("combobox", { name: "Team member", exact: true })
    .selectOption(id);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect.poll(() => f.writes.length).toBe(2);
  expect(f.writes[1].body).toEqual({ user_id: id, role: "manager" });
});
test("editor layout stays bounded and accessible on desktop and narrow screens", async ({
  page,
}) => {
  await setup(page);
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await edit(page, "products");
    await page
      .getByRole("button", { name: "Product details", exact: true })
      .click();
    const save = page.getByRole("button", {
      name: "Save changes",
      exact: true,
    });
    await expect(save).toBeInViewport({ ratio: 1 });
    await expect(
      page.getByRole("heading", { name: "Edit products & inventory" }),
    ).toBeInViewport({ ratio: 1 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: `test-results/admin-editor-${width}.png`,
      fullPage: false,
    });
    await page.getByLabel("Close dialog").click();
  }
});

test("Back and Forward require a dirty-draft decision and pending navigation cannot leave", async ({
  page,
}) => {
  const f = await setup(page);
  await page.goto("/admin?section=customers");
  await page
    .getByRole("button", { name: "Products & inventory", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByRole("button", { name: "Product details", exact: true })
    .click();
  await page.getByLabel("Name", { exact: true }).fill("Unsaved product");
  await page.goBack();
  await expect(
    page.getByRole("dialog", { name: "Leave with unsaved changes?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Stay on this page" }).click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    "Unsaved product",
  );
  await page.goBack();
  await page.getByRole("button", { name: "Discard and leave" }).click();
  await expect(page).toHaveURL(/section=customers/);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Saved customer");
  f.state.slowSave = true;
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect.poll(() => f.writes.length).toBe(1);
  await page.goForward();
  await expect(page.getByRole("dialog", { name: "Please wait" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Discard and leave" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Stay on this page" }).click();
  f.releaseSave();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("variant moves and new packs retain their order after BFF reload", async ({
  page,
}) => {
  const f = await setup(page);
  await edit(page, "products");
  await page
    .getByRole("button", { name: "Packs & pricing", exact: true })
    .click();
  await page
    .getByRole("button", { name: "+ Add variants", exact: true })
    .click();
  await page.getByLabel("Label", { exact: true }).last().fill("500 g");
  await page
    .getByRole("button", { name: "Move Variants item 2 up", exact: true })
    .click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect.poll(() => f.writes.length).toBe(1);
  expect(f.writes[0].body.variants.map((v) => v.sort_order)).toEqual([0, 1]);
  await edit(page, "products");
  await page
    .getByRole("button", { name: "Packs & pricing", exact: true })
    .click();
  await expect(page.getByLabel("Label", { exact: true }).first()).toHaveValue(
    "500 g",
  );
});
test("a settings conflict preserves the draft and sends the original revision", async ({
  page,
}) => {
  const f = await setup(page);
  let saved: any;
  await page.route("**/api/admin/settings", async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    saved = route.request().postDataJSON();
    await route.fulfill({
      status: 409,
      json: {
        error:
          "These settings changed while you were editing. Your changes were not saved.",
      },
    });
  });
  await edit(page, "settings", "commerce");
  await page.getByRole("button", { name: "General", exact: true }).click();
  await page.getByLabel("Wrap fee", { exact: true }).fill("150");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "changed while you were editing",
  );
  await expect(page.getByLabel("Wrap fee", { exact: true })).toHaveValue("150");
  expect(saved.revision).toBe(1);
  expect(
    f.reads.filter((p) => p.startsWith("/api/admin/settings")).length,
  ).toBeGreaterThan(1);
});

test("mobile section drawer supports navigation, dismissal and desktop resize", async ({
  page,
}) => {
  await setup(page);
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/admin?section=orders");
  const toggle = page.getByRole("button", { name: "Open admin sections" });
  await expect(
    page.getByRole("navigation", { name: "Admin sections" }),
  ).toBeHidden();
  await toggle.click();
  const drawer = page.getByRole("dialog", {
    name: "Admin sections",
    exact: true,
  });
  await expect(drawer).toBeVisible();
  await expect(
    drawer.getByRole("button", { name: "Orders", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    drawer.getByRole("button", { name: "Close dialog" }),
  ).toBeFocused();
  await page.locator("body").evaluate(async (element) => {
    await document.fonts.ready;
    await Promise.all(
      element
        .getAnimations({ subtree: true })
        .filter(
          (animation) => animation.effect?.getTiming().iterations !== Infinity,
        )
        .map((animation) => animation.finished.catch(() => undefined)),
    );
  });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({ path: "test-results/admin-navigation-320.png" });
  await drawer
    .getByRole("button", { name: "Products & inventory", exact: true })
    .click();
  await expect(drawer).toHaveCount(0);
  await expect(page).toHaveURL(/section=products/);
  await expect(toggle).toBeFocused();
  await toggle.click();
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(toggle).toBeFocused();
  await toggle.click();
  await page.mouse.click(315, 350);
  await expect(drawer).toHaveCount(0);
  await toggle.click();
  await drawer
    .getByRole("button", { name: "Activity log", exact: true })
    .click();
  await expect(page).toHaveURL(/section=admin_audit/);
  await toggle.click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(drawer).toHaveCount(0);
  await expect(toggle).toBeHidden();
  await expect(
    page.getByRole("navigation", { name: "Admin sections" }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe(
    "hidden",
  );
});
