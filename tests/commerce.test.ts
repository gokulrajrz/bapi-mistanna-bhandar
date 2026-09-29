import { describe, it, expect } from "vitest";
import {
  boxPrice,
  filterProducts,
  totals,
  checkoutSchema,
} from "../src/lib/commerce";
import { seedProducts } from "../src/data/products";
import { orderRequestSchema } from "../server/checkout-schema";
const item = {
  key: "a",
  productId: "sweet-1",
  variantId: "sweet-1-0",
  name: "Kaju Katli",
  image: "",
  label: "250 g",
  price: 499,
  quantity: 1,
};
describe("commerce rules", () => {
  it("matches ingredients and persists filter semantics", () => {
    expect(
      filterProducts(seedProducts, { search: "cashew" }).map((p) => p.name),
    ).toContain("Kaju Katli");
    expect(
      filterProducts(seedProducts, {
        category: "Milk sweets",
        maxPrice: 300,
      }).every(
        (p) => p.category === "Milk sweets" && p.variants[0].price <= 300,
      ),
    ).toBe(true);
  });
  it("calculates local delivery, free delivery, pickup and capped coupons", () => {
    expect(totals([item], "delivery", "781001").total).toBe(548);
    expect(totals([item], "pickup").total).toBe(499);
    expect(totals([{ ...item, quantity: 3 }]).shipping).toBe(0);
    expect(
      totals([{ ...item, quantity: 10 }], "delivery", "", "SWEET10").discount,
    ).toBe(200);
  });
  it("prices individual box pieces plus packing and gift wrap", () => {
    expect(boxPrice({ "sweet-1": 3, "sweet-2": 3 }, seedProducts, true)).toBe(
      3 * 65 + 3 * 40 + 99 + 49,
    );
  });
  it("rejects malformed checkout and validates on the backend independently", () => {
    expect(checkoutSchema.safeParse({}).success).toBe(false);
    expect(orderRequestSchema.safeParse({ items: [] }).success).toBe(false);
  });
  it("strips browser prices and rejects negative quantities at the BFF boundary", () => {
    const body = {
      requestId: crypto.randomUUID(),
      items: [{ ...item, price: 1 }],
      contact: {
        name: "Test Customer",
        email: "test@example.com",
        phone: "9876543210",
        address: "123 Test Road, Assam",
        pincode: "781001",
        method: "delivery",
        date: "2099-10-01",
        coupon: "",
        message: "",
      },
    };
    const parsed = orderRequestSchema.parse(body);
    expect(parsed.items[0]).not.toHaveProperty("price");
    expect(
      orderRequestSchema.safeParse({
        ...body,
        items: [{ ...item, quantity: -1 }],
      }).success,
    ).toBe(false);
  });
});
