import { it, expect } from "vitest";
import { availableVariant } from "../src/lib/products";
import { seedProducts } from "../src/data/products";
it("quick-add chooses an available variant even when the first is sold out", () => {
  const product = {
    ...seedProducts[0],
    variants: [
      { id: "small", label: "250 g", price: 100, stock: 0 },
      { id: "large", label: "500 g", price: 200, stock: 3 },
    ],
  };
  expect(availableVariant(product)?.id).toBe("large");
  expect(
    availableVariant({
      ...product,
      variants: product.variants.map((v) => ({ ...v, stock: 0 })),
    })?.stock,
  ).toBe(0);
  expect(availableVariant({ ...product, variants: [] })).toBeUndefined();
});
