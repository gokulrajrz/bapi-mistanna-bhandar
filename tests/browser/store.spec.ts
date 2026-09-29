import { test, expect } from "@playwright/test";
test("shopping, persistent cart, variants, validated demo checkout", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A little sweet. A little Assam." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add Kaju Katli to bag" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Open shopping bag" }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: "Kaju Katli", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: /Checkout ·/ }).click();
  await page.getByRole("button", { name: "Review my order" }).click();
  await expect(page.getByText("Enter your full name.")).toBeVisible();
  await page.getByLabel("Full name").fill("Test Customer");
  await page.getByLabel("Email address").fill("test@example.com");
  await page.getByLabel("Mobile number").fill("9876543210");
  await page
    .getByLabel("Delivery address")
    .fill("123 Test Road, Guwahati, Assam");
  await page.getByLabel("Pincode").fill("781001");
  await page.getByLabel("Preferred delivery date").fill("2099-10-01");
  await page.getByLabel("Coupon code").fill("SWEET10");
  await page.getByRole("button", { name: "Review my order" }).click();
  await page.getByRole("button", { name: "Complete demo checkout" }).click();
  await expect(
    page.getByRole("heading", { name: "That was sweet." }),
  ).toBeVisible();
  await expect(
    page.getByText("No real order was placed", { exact: false }),
  ).toBeVisible();
});
test("URL filters and ingredient search", async ({ page }) => {
  await page.goto("/shop?search=cashew");
  await expect(
    page.getByRole("heading", { name: "Kaju Katli", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Gulab Jamun", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Clear search" }).click();
  await page.getByRole("button", { name: "Milk sweets", exact: true }).click();
  await expect(page).toHaveURL(/category=Milk/);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Gulab Jamun", exact: true }),
  ).toBeVisible();
});
test("gift box fills, respects capacity and adds personal details", async ({
  page,
}) => {
  await page.goto("/build-a-box");
  await expect(
    page.getByRole("button", { name: "Choose 6 more sweets" }),
  ).toBeDisabled();
  const plus = page.getByRole("button", { name: "Increase quantity" }).first();
  for (let i = 0; i < 6; i++) await plus.click();
  await expect(plus).toBeDisabled();
  await page.getByLabel("To", { exact: true }).fill("A loved one");
  await page.getByRole("button", { name: "Add your box to bag" }).click();
  await expect(page.getByRole("dialog")).toContainText("6 handpicked pieces");
  await expect(page.getByRole("dialog")).toContainText("For A loved one");
});
test("product variants update cart price", async ({ page }) => {
  await page.goto("/products/kaju-katli");
  await page.getByRole("button", { name: "500 g", exact: true }).click();
  await page.getByRole("button", { name: "Add to bag" }).click();
  await expect(page.getByRole("dialog")).toContainText("500 g");
  await expect(page.getByRole("dialog")).toContainText("₹948");
});
for (const width of [320, 390, 768, 1440])
  test(`no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of [
      "/",
      "/shop",
      "/products/kaju-katli",
      "/build-a-box",
      "/gifts",
    ]) {
      await page.goto(path);
      await page.waitForTimeout(100);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        path,
      ).toBe(true);
    }
    await page.goto("/");
    await page.screenshot({
      path: `/tmp/bapi-viewport-${width}.png`,
      animations: "disabled",
    });
    await page.screenshot({
      path: `/tmp/bapi-home-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
  });

test("admin edits validated settings and product variants in preview", async ({
  page,
}) => {
  await page.goto("/admin?section=settings");
  const row = page
    .getByRole("row")
    .filter({ has: page.getByText("storefront", { exact: true }) });
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Hero Title", exact: true })
    .fill("A sweet welcome.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Saved in this admin preview only",
  );
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Hero Title", exact: true }),
  ).toHaveValue("A sweet welcome.");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("button", { name: "Products & inventory", exact: true })
    .click();
  await page
    .getByRole("row")
    .filter({ hasText: "Kaju Katli" })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await expect(
    page.getByLabel("Available packs (excludes reservations)").first(),
  ).toBeVisible();
});
