import { config } from "./config";
import type { CartItem, Product } from "./types";
export { contactSchema as checkoutSchema } from "../../shared/validation";
export function totals(
  items: CartItem[],
  method = "delivery",
  pincode = "",
  coupon = "",
) {
  const subtotal = Math.round(
    items.reduce((n, i) => n + i.price * i.quantity, 0),
  );
  const shipping =
    method === "pickup" || subtotal >= config.freeShipping || !subtotal
      ? 0
      : config.localPincodes.includes(pincode)
        ? config.localShipping
        : config.shipping;
  const discount =
    coupon.toUpperCase() === "SWEET10"
      ? Math.min(Math.round(subtotal * 0.1), 200)
      : 0;
  return {
    subtotal,
    shipping,
    discount,
    total: subtotal + shipping - discount,
  };
}
export function boxPrice(
  pieces: Record<string, number>,
  products: Product[],
  wrap = false,
  fees: { boxFee: number; wrapFee: number } = config,
) {
  return (
    fees.boxFee +
    Object.entries(pieces).reduce(
      (n, [id, q]) =>
        n + (products.find((p) => p.id === id)?.piecePrice ?? 0) * q,
      0,
    ) +
    (wrap ? fees.wrapFee : 0)
  );
}
export { filterProducts } from "./filters";
