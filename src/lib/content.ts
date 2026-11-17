import { defaultStorefront } from "../../shared/storefront-defaults";
import {
  storefrontExtra,
  defaultBoxSizes,
} from "../../shared/storefront-extra";
import { homeContent } from "../../shared/home-content";
import { useQuery } from "@tanstack/react-query";
import { config } from "./config";
import { isDemo } from "./api";
import { api } from "./request";
import { demoArticles } from "../data/content";
import type { StoreContent } from "./types";
export { defaultStorefront } from "../../shared/storefront-defaults";
export const demoContent: StoreContent = {
  settings: {
    name: config.name,
    address: config.address,
    phone: config.phone,
    hours: "",
    pickupInstructions: "",
    policies: [],
    launchApproved: false,
  },
  commerce: {
    boxSizes: defaultBoxSizes,
    boxFee: 99,
    wrapFee: 49,
    freeShipping: 999,
    pickupEnabled: true,
  },
  campaigns: [],
  collections: [],
  posts: demoArticles,
  store: null,
  paymentEnabled: false,
  turnstileSiteKey: null,
  storefront: defaultStorefront,
  operations: {
    checkoutEnabled: false,
    maintenanceMode: false,
    maintenanceMessage:
      "We are preparing something sweet. Please check back shortly.",
    reviewSubmissions: true,
    bulkEnquiries: true,
  },
  categories: [
    "Assamese specialties",
    "Milk sweets",
    "Nut sweets",
    "Classics",
    "Gift boxes",
  ],
};
export const contentOptions = {
  queryKey: ["content"] as const,
  queryFn: ({ signal }: { signal: AbortSignal }) =>
    isDemo
      ? Promise.resolve(demoContent)
      : api<StoreContent>("/api/content", { signal }),
  staleTime: 30_000,
};
export function useStoreContent() {
  const query = useQuery(contentOptions);
  return { ...query, content: query.data || demoContent };
}
