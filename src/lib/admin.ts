import { seedProducts } from "../data/products";
import { demoContent } from "./content";
import { isDemo } from "./api";
import { api, ApiError } from "./request";
export type Json =
  string | number | boolean | null | Json[] | { [key: string]: Json };
export type AdminRecord = Record<string, Json>;
export const adminResources = [
  ["overview", "Overview"],
  ["orders", "Orders"],
  ["customers", "Customers"],
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
          storageInstructions: "",
          freshnessDetails: "",
          crossContactWarning: "",
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
          storageInstructions: "",
          freshnessDetails: "",
          crossContactWarning: "",
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
    filters: Record<string, string> = {},
    signal?: AbortSignal,
  ): Promise<{
    items: AdminRecord[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    if (!isDemo)
      return api(
        `/api/admin/${resource}?${new URLSearchParams({ ...filters, page: String(page) })}`,
        { signal },
      );
    const items = (memory.get(resource) || initial(resource)).filter((r) => {
      if (
        filters.q &&
        !JSON.stringify(r).toLowerCase().includes(filters.q.toLowerCase())
      )
        return false;
      if (
        filters.status &&
        String(r.status ?? r.role ?? r.active ?? r.published) !== filters.status
      )
        return false;
      if (
        filters.method &&
        (r.contact as AdminRecord)?.method !== filters.method
      )
        return false;
      if (
        filters.from &&
        Date.parse(String(r.created_at)) <
          Date.parse(filters.from + "T00:00:00+05:30")
      )
        return false;
      if (
        filters.to &&
        Date.parse(String(r.created_at)) >=
          Date.parse(filters.to + "T00:00:00+05:30") + 86400000
      )
        return false;
      return true;
    });
    if (filters.sort)
      items.sort((a, b) =>
        filters.sort === "name"
          ? String(
              (a.data as AdminRecord)?.name || a.name || a.title || a.id,
            ).localeCompare(
              String(
                (b.data as AdminRecord)?.name || b.name || b.title || b.id,
              ),
            )
          : String(a.created_at || a.updated_at || a.id).localeCompare(
              String(b.created_at || b.updated_at || b.id),
            ) * (filters.sort === "oldest" ? 1 : -1),
      );
    return {
      items: items
        .slice((page - 1) * 50, page * 50)
        .map((r) =>
          ["stores", "settings"].includes(resource)
            ? { ...r, revision: r.revision ?? 1 }
            : r,
        ),
      total: items.length,
      page,
      pageSize: 50,
    };
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
    if (resource === "delivery_zones" && !record.id)
      record = {
        ...record,
        id: Math.max(0, ...old.map((r) => Number(r.id) || 0)) + 1,
      };
    const index = old.findIndex((r) => r[key] === record[key]);
    if (["settings", "stores"].includes(resource)) {
      const expected = index >= 0 ? Number(old[index].revision ?? 1) : 0;
      if (Number(record.revision ?? 0) !== expected)
        throw new ApiError(
          "These settings changed while you were editing. Your changes were not saved. Close and reopen to review the latest values.",
          409,
        );
      record = { ...record, revision: expected + 1 };
    }
    const next = [...old];
    if (index >= 0) next[index] = record;
    else next.push(record);
    memory.set(resource, next);
    if (resource === "stores") {
      const settings = structuredClone(
        memory.get("settings") || initial("settings"),
      );
      for (const r of settings) {
        if (["public", "commerce"].includes(String(r.key)))
          r.revision = Number(r.revision ?? 1) + 1;
        if (r.key === "public")
          r.value = {
            ...(r.value as AdminRecord),
            name: record.name,
            address: record.address,
            phone: record.phone,
            hours: (record.data as AdminRecord).hours,
            pickupInstructions: (record.data as AdminRecord).pickupInstructions,
          };
        if (r.key === "commerce")
          r.value = {
            ...(r.value as AdminRecord),
            pickupEnabled: record.pickup_enabled,
          };
      }
      memory.set("settings", settings);
    } else if (
      resource === "settings" &&
      ["public", "commerce"].includes(String(record.key))
    ) {
      const stores = structuredClone(memory.get("stores") || initial("stores"));
      const value = record.value as AdminRecord;
      for (const store of stores) {
        store.revision = Number(store.revision ?? 1) + 1;
        if (record.key === "commerce")
          store.pickup_enabled = value.pickupEnabled;
        else {
          Object.assign(store, {
            name: value.name,
            address: value.address,
            phone: value.phone,
          });
          store.data = {
            ...(store.data as AdminRecord),
            hours: value.hours,
            pickupInstructions: value.pickupInstructions,
          };
        }
      }
      memory.set("stores", stores);
    }

    return record;
  },
};
