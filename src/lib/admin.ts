import { seedProducts } from "../data/products";
import { demoContent } from "./content";
import { isDemo } from "./api";
import { api } from "./request";
export type Json =
  string | number | boolean | null | Json[] | { [key: string]: Json };
export type AdminRecord = Record<string, Json>;
export const adminResources = [
  ["overview", "Overview"],
  ["orders", "Orders"],
  ["products", "Products & inventory"],
  ["delivery_zones", "Delivery areas"],
  ["coupons", "Coupons"],
  ["collections", "Collections"],
  ["festival_campaigns", "Festival campaigns"],
  ["blog_posts", "Journal"],
  ["stores", "Store"],
  ["reviews", "Reviews"],
  ["refund_jobs", "Refunds"],
  ["settings", "Storefront & settings"],
  ["admin_users", "Team access"],
  ["admin_audit", "Activity log"],
] as const;
export function freshRecord(resource: string): AdminRecord {
  const id = crypto.randomUUID();
  switch (resource) {
    case "products":
      return {
        id,
        slug: "",
        active: false,
        sort_order: 0,
        data: {
          name: "",
          description: "",
          category: "Classics",
          image: "/images/hero.webp",
          gallery: ["/images/hero.webp"],
          ingredients: [],
          allergens: [],
          tags: [],
          shelfLife: "5 days",
          shelfLifeDays: 5,
          requiresRefrigeration: false,
          featured: false,
          createdAt: new Date().toISOString(),
        },
        variants: [
          { id: `${id}-0`, label: "250 g", price: 0, stock: 0, sort_order: 0 },
        ],
        inventory: { piece_price: 0, pieces: 0 },
      };
    case "delivery_zones":
      return {
        name: "",
        pincode: "",
        charge: 0,
        minimum_order: 0,
        active: false,
        min_days: 1,
        max_days: 2,
        refrigerated: false,
        same_day_cutoff: 12,
      };
    case "coupons":
      return {
        code: "",
        percent: 10,
        max_discount: 200,
        minimum_order: 0,
        expires_at: null,
        active: false,
      };
    case "collections":
      return {
        id,
        title: "",
        description: "",
        product_ids: [],
        hero: "/images/hero.webp",
        active: false,
      };
    case "festival_campaigns":
      return {
        id,
        collection_id: "",
        banner: "",
        starts_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + 86400000 * 7).toISOString(),
        active: false,
      };
    case "blog_posts":
      return {
        slug: "",
        title: "",
        body: "",
        published: false,
        data: { tag: "FROM OUR KITCHEN", image: "/images/hero.webp" },
      };
    case "stores":
      return {
        id: "main",
        name: demoContent.settings.name,
        address: demoContent.settings.address,
        phone: "",
        hours: {},
        pickup_enabled: false,
        data: { image: "", hours: "", pickupInstructions: "" },
      };
    case "admin_users":
      return { user_id: "", role: "manager" };
    default:
      return {};
  }
}
function initial(resource: string): AdminRecord[] {
  switch (resource) {
    case "products":
      return seedProducts.map((p, index) => ({
        id: p.id,
        slug: p.slug,
        active: true,
        sort_order: index,
        data: {
          name: p.name,
          description: p.description,
          category: p.category,
          image: p.image,
          gallery: p.gallery,
          ingredients: p.ingredients,
          allergens: p.allergens,
          tags: p.tags,
          shelfLife: p.shelfLife,
          shelfLifeDays: p.shelfLifeDays,
          requiresRefrigeration: p.requiresRefrigeration,
          featured: p.featured,
          createdAt: p.createdAt,
        },
        variants: p.variants.map((v, i) => ({ ...v, sort_order: i })),
        inventory: { piece_price: p.piecePrice, pieces: p.pieceStock },
      }));
    case "settings":
      return [
        { key: "public", value: demoContent.settings as unknown as Json },
        {
          key: "commerce",
          value: {
            ...demoContent.commerce,
            reservationMinutes: 20,
            pickupMinDays: 1,
            cancellationEnabled: true,
          },
        },
        { key: "storefront", value: demoContent.storefront as unknown as Json },
        { key: "operations", value: demoContent.operations as unknown as Json },
      ];
    case "blog_posts":
      return demoContent.posts.map((p) => ({
        slug: p.slug,
        title: p.title,
        body: p.body.join("\n\n"),
        published: true,
        data: { tag: p.tag, image: p.image },
      }));
    case "stores":
      return [freshRecord("stores")];
    default:
      return [];
  }
}
const memory = new Map<string, AdminRecord[]>();
export const adminApi = {
  async list(
    resource: string,
    page = 1,
  ): Promise<{
    items: AdminRecord[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    if (!isDemo) return api(`/api/admin/${resource}?page=${page}`);
    const items = memory.get(resource) || initial(resource);
    return { items, total: items.length, page: 1, pageSize: 50 };
  },
  async save(resource: string, record: AdminRecord) {
    if (!isDemo)
      return api(`/api/admin/${resource}`, {
        method: "PUT",
        body: JSON.stringify(record),
      });
    const old = memory.get(resource) || initial(resource);
    const key =
      resource === "settings"
        ? "key"
        : resource === "coupons"
          ? "code"
          : resource === "blog_posts"
            ? "slug"
            : resource === "admin_users"
              ? "user_id"
              : "id";
    const index = old.findIndex((r) => r[key] === record[key]);
    const next = [...old];
    if (index >= 0) next[index] = record;
    else next.push(record);
    memory.set(resource, next);
    return record;
  },
};
