import type { Product } from "./types";
export function availableVariant(product: Product) {
  return (
    product.variants.find((variant) => variant.stock > 0) ?? product.variants[0]
  );
}
