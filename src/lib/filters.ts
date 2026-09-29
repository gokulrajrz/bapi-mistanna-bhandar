import type { Product, Filters } from "./types";
export function filterProducts(products: Product[], f: Filters) {
  let result = products.filter(
    (p) =>
      (!f.category || p.category === f.category) &&
      (!f.search ||
        [p.name, p.category, ...p.ingredients, ...p.tags]
          .join(" ")
          .toLowerCase()
          .includes(f.search.toLowerCase())) &&
      (!f.occasion || p.tags.includes(f.occasion)) &&
      (!f.maxPrice || p.variants[0].price <= f.maxPrice) &&
      (!f.available || p.variants.some((v) => v.stock > 0)) &&
      (!f.dietary || p.tags.includes(f.dietary)),
  );
  if (f.sort === "price-asc")
    result.sort((a, b) => a.variants[0].price - b.variants[0].price);
  if (f.sort === "price-desc")
    result.sort((a, b) => b.variants[0].price - a.variants[0].price);
  if (f.sort === "newest")
    result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return result;
}
