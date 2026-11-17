import type { Json } from "../../lib/admin";
export const fieldLabels: Record<string, string> = {
  stock: "Available packs",
  pieces: "Available individual pieces",
  piece_price: "Price per piece (₹)",
  sort_order: "Display order",
  freeShipping: "Free shipping from (₹)",
  min_days: "Earliest delivery (days)",
  max_days: "Maximum transit days",
  same_day_cutoff: "Same-day cutoff hour (India time)",
  user_id: "Team member",
  product_ids: "Products",
  collection_id: "Collection",
  launchApproved: "Approve launch after reviewing business details",
  expires_at: "Expiry (India time; optional)",
  starts_at: "Starts (India time)",
  ends_at: "Ends (India time)",
  staff_notes: "Staff notes",
  primaryColor: "Brand colour",
  backgroundColor: "Background colour",
  pickup_enabled: "Allow store pickup",
  pickupEnabled: "Allow store pickup",
  id: "Reference",
  createdAt: "Created at",
  created_at: "Created at",
};
export const label = (key: string) =>
  fieldLabels[key] ||
  key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^./, (s) => s.toUpperCase());
export const pathLabel = (path: string) =>
  path
    .split(".")
    .filter((k) => !["data", "value", "storefront"].includes(k))
    .map((k) => (/^\d+$/.test(k) ? `Item ${Number(k) + 1}` : label(k)))
    .join(" › ");
export function arrayItem(path: string): Json {
  const key = path.split(".").at(-1)!;
  const templates: Record<string, Json> = {
    variants: {
      id: crypto.randomUUID(),
      revision: 0,
      label: "",
      price: 0,
      stock: 0,
      sort_order: 0,
    },
    policies: { title: "", body: "" },
    navigation: { label: "", to: "/shop" },
    links: { label: "", to: "/shop" },
    footerColumns: { title: "", links: [] },
    giftingCards: { title: "", description: "", to: "/shop", image: "" },
    occasions: { title: "", sub: "", to: "/shop", image: "" },
    badges: { category: "", productId: "", label: "" },
    dietaryOptions: { label: "", value: "" },
    occasionOptions: { label: "", value: "" },
    prices: 0,
    boxSizes: 6,
  };
  return structuredClone(templates[key] ?? "");
}
export function arrayBounds(path: string) {
  const k = path.split(".").at(-1)!;
  const b: Record<string, [number, number]> = {
    variants: [1, 12],
    gallery: [1, 8],
    boxSizes: [1, 8],
    promises: [4, 4],
    navigation: [1, 8],
    footerColumns: [0, 5],
    links: [0, 12],
    occasions: [0, 8],
    giftingCards: [0, 12],
    prices: [0, 12],
    policies: [0, 20],
    product_ids: [0, 500],
    storyParagraphs: [0, 20],
    makingSteps: [0, 12],
    dietaryOptions: [0, 20],
    occasionOptions: [0, 20],
  };
  return b[k] ?? [0, 30];
}
export const numericKeys = new Set([
  "price",
  "stock",
  "piece_price",
  "pieces",
  "sort_order",
  "charge",
  "minimum_order",
  "percent",
  "max_discount",
  "reservationMinutes",
  "pickupMinDays",
  "boxFee",
  "wrapFee",
  "freeShipping",
  "min_days",
  "max_days",
  "same_day_cutoff",
  "shelfLifeDays",
]);
export function numericRule(path: string) {
  const key = path.split(".").at(-1)!;
  const parent = path.split(".").at(-2);
  const limits: Record<string, [number, number]> = {
    stock: [0, 100000],
    pieces: [0, 100000],
    sort_order: [0, path.includes("variants.") ? 100 : 10000],
    percent: [1, 100],
    reservationMinutes: [10, 60],
    pickupMinDays: [0, 30],
    min_days: [0, 30],
    max_days: [0, 30],
    same_day_cutoff: [0, 23],
    shelfLifeDays: [1, 365],
  };
  const integer = key in limits || parent === "boxSizes";
  const [min, max] =
    parent === "boxSizes" ? [1, 48] : limits[key] || [0, 1000000];
  return {
    numeric:
      numericKeys.has(key) || parent === "boxSizes" || parent === "prices",
    step: integer ? "1" : "0.01",
    min,
    max,
  };
}
export const imagePath = (path: string) =>
  /^(image|hero|logo|favicon|heroImage|socialImage|introductionImage)$/i.test(
    path.split(".").at(-1)!,
  ) || path.includes("gallery.");
export function toIndiaInput(value: Json) {
  if (!value) return "";
  const d = new Date(String(value));
  return Number.isNaN(d.valueOf())
    ? ""
    : new Date(d.valueOf() + 19800000).toISOString().slice(0, 16);
}
export function fromIndiaInput(value: string, nullable = false): Json {
  if (!value) return nullable ? null : "";
  const date = new Date(`${value}+05:30`);
  return Number.isNaN(date.valueOf()) ? "" : date.toISOString();
}
export function atPath(value: Json, path: string): Json {
  let current = value;
  for (const k of path.split("."))
    current = (current as Record<string, Json>)?.[k];
  return current;
}
export function setPath(value: Json, path: string, next: Json): Json {
  const copy = structuredClone(value) as Record<string, Json>;
  const parts = path.split(".");
  let target = copy;
  for (const k of parts.slice(0, -1))
    target = target[k] as Record<string, Json>;
  target[parts.at(-1)!] = next;
  return copy;
}

export function orderArray(path: string, items: Json[]): Json[] {
  return path.split(".").at(-1) === "variants"
    ? items.map((item, index) => ({
        ...(item as Record<string, Json>),
        sort_order: index,
      }))
    : items;
}
