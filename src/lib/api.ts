import { seedProducts } from "../data/products";
import { checkoutSchema, filterProducts, totals, boxPrice } from "./commerce";
import { api } from "./request";
import type {
  CartItem,
  Checkout,
  Filters,
  Order,
  Product,
  ProductPage,
  Quote,
} from "./types";
export const isDemo = import.meta.env.VITE_DEMO_MODE !== "false";
export const catalogue = {
  async page(
    filters: Filters = {},
    signal?: AbortSignal,
  ): Promise<ProductPage> {
    if (isDemo) {
      let items = filterProducts(seedProducts, filters);
      if (filters.featured) items = items.filter((p) => p.featured);
      const page = filters.page || 1,
        pageSize = filters.pageSize || 12;
      return {
        items: items.slice((page - 1) * pageSize, page * pageSize),
        total: items.length,
        page,
        pageSize,
      };
    }
    const params = new URLSearchParams(
      Object.entries(filters)
        .filter(([, v]) => v !== undefined && v !== "")
        .map(([k, v]) => [k, String(v)]),
    );
    return api(`/api/products?${params}`, { signal });
  },
  async list(filters: Filters = {}, signal?: AbortSignal): Promise<Product[]> {
    return (
      await catalogue.page(
        { ...filters, pageSize: filters.pageSize || 48 },
        signal,
      )
    ).items;
  },
  async product(slug: string, signal?: AbortSignal): Promise<Product | null> {
    return isDemo
      ? (seedProducts.find((p) => p.slug === slug) ?? null)
      : api(`/api/products/${encodeURIComponent(slug)}`, { signal });
  },
  async reviews(
    id: string,
    signal?: AbortSignal,
  ): Promise<
    {
      id: string;
      name: string;
      rating: number;
      body: string;
      created_at: string;
      verified: boolean;
    }[]
  > {
    return isDemo
      ? []
      : api(`/api/reviews/${encodeURIComponent(id)}`, { signal });
  },
};
const demoQuotes = new Map<string, Quote>();
export const orders = {
  async quote(input: { items: CartItem[]; contact: Checkout }): Promise<Quote> {
    checkoutSchema.parse(input.contact);
    if (!isDemo)
      return api("/api/quote", { method: "POST", body: JSON.stringify(input) });
    if (!input.items.length) throw new Error("Your bag is empty.");
    if (input.contact.coupon && input.contact.coupon !== "SWEET10")
      throw new Error("This coupon is invalid. Try SWEET10.");
    const validated = input.items.map((item) => {
      if (item.box)
        return {
          ...item,
          price: boxPrice(item.box.pieces, seedProducts, item.gift?.wrap),
        };
      const p = seedProducts.find((p) => p.id === item.productId),
        v = p?.variants.find((v) => v.id === item.variantId);
      if (!p || !v || item.quantity > v.stock)
        throw new Error("A sweet in your bag is unavailable.");
      return {
        ...item,
        name: p.name,
        label: v.label,
        price: v.price + (item.gift?.wrap ? 49 : 0),
      };
    });
    const summary = totals(
      validated,
      input.contact.method,
      input.contact.pincode,
      input.contact.coupon,
    );
    const quote = {
      ...summary,
      id: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 600000).toISOString(),
      amount: Math.round(summary.total * 100),
      currency: "INR",
      earliestDate: input.contact.date,
      deliveryLabel:
        input.contact.method === "pickup" ? "Store pickup" : "Demo delivery",
      lines: validated.map((i) => ({ ...i, unitPrice: i.price })),
    };
    demoQuotes.set(quote.id, quote);
    return quote;
  },
  async create(input: {
    requestId: string;
    quoteId: string;
    turnstileToken: string;
  }): Promise<Order> {
    if (!isDemo)
      return api("/api/checkout", {
        method: "POST",
        body: JSON.stringify(input),
      });
    const quote = demoQuotes.get(input.quoteId);
    if (!quote || Date.parse(quote.expiresAt) < Date.now())
      throw new Error("Your quote expired. Please review your order again.");
    return {
      id: `DEMO-${input.requestId.slice(0, 8).toUpperCase()}`,
      total: quote.total,
      status: "demo",
    };
  },
};
