import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { catalogue, orders } from "./api";
import type { Filters } from "./types";
export const keys = {
  products: ["products"] as const,
  list: (filters: Filters) => ["products", "list", filters] as const,
  detail: (slug: string) => ["products", "detail", slug] as const,
  reviews: (id: string) => ["reviews", id] as const,
};
export const productQueries = {
  page: (filters: Filters = {}) =>
    queryOptions({
      queryKey: [...keys.list(filters), "page"],
      queryFn: ({ signal }) => catalogue.page(filters, signal),
      placeholderData: keepPreviousData,
      staleTime: 30_000,
    }),
  list: (filters: Filters = {}) =>
    queryOptions({
      queryKey: keys.list(filters),
      queryFn: ({ signal }) => catalogue.list(filters, signal),
      placeholderData: keepPreviousData,
      staleTime: 60_000,
    }),
  detail: (slug: string) =>
    queryOptions({
      queryKey: keys.detail(slug),
      queryFn: ({ signal }) => catalogue.product(slug, signal),
      enabled: !!slug,
    }),
  reviews: (id: string) =>
    queryOptions({
      queryKey: keys.reviews(id),
      queryFn: ({ signal }) => catalogue.reviews(id, signal),
      enabled: !!id,
    }),
};
export function useCreateOrder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: orders.create,
    retry: 0,
    onSuccess: async (order) => {
      await client.invalidateQueries({ queryKey: ["orders", order.id] });
      await client.invalidateQueries({ queryKey: keys.products });
      await client.invalidateQueries({ queryKey: ["account"] });
    },
  });
}
