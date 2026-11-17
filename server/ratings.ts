import { db, type Env } from "./supabase";
import { rpcError } from "./http";
export async function ratingSummaries(env: Env, ids: string[]) {
  if (!ids.length) return {};
  const { data, error } = await db(env).rpc("product_rating_summary", {
    product_ids: ids,
  });
  rpcError(error);
  return data as Record<string, { ratingCount: number; ratingAverage: number }>;
}
