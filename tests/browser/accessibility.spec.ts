import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
for (const path of [
  "/",
  "/shop",
  "/products/kaju-katli",
  "/build-a-box",
  "/admin?section=settings",
  "/account",
]) {
  test(`accessibility ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.locator("body").evaluate(async (element) => {
      await Promise.all(
        element
          .getAnimations({ subtree: true })
          .filter((a) => a.effect?.getTiming().iterations !== Infinity)
          .map((a) => a.finished.catch(() => undefined)),
      );
    });
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
  });
}

test("cart estimate remains accessible at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/products/kaju-katli");
  await page.getByRole("button", { name: "Add to bag", exact: true }).click();
  await expect(page.getByLabel("Pincode", { exact: true })).toBeVisible();
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    result.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
