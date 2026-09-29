import { z } from "zod";
import { db } from "../../../server/supabase";
import { endpoint, response, rpcError, HttpError } from "../../../server/http";
const schema = z.object({
  search: z.string().max(100).optional(),
  category: z.string().max(80).optional(),
  occasion: z.string().max(40).optional(),
  dietary: z.string().max(40).optional(),
  collection: z.string().max(80).optional(),
  sort: z.enum(["popular", "newest", "price-asc", "price-desc"]).optional(),
  available: z.enum(["true", "false"]).optional(),
  featured: z.enum(["true", "false"]).optional(),
  maxPrice: z.coerce.number().nonnegative().max(1000000).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(12),
});
export const onRequestGet = endpoint(async (ctx) => {
  const parsed = schema.safeParse(
    Object.fromEntries(new URL(ctx.request.url).searchParams),
  );
  if (!parsed.success) throw new HttpError(400, "Invalid catalogue filters.");
  const { data, error } = await db(ctx.env).rpc("catalogue_page", {
    filters: parsed.data,
  });
  rpcError(error);
  const res = response(data);
  res.headers.set(
    "Cache-Control",
    "public, max-age=15, s-maxage=30, stale-while-revalidate=60",
  );
  return res;
});
