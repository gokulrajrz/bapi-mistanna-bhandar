import { z } from "zod";
import { db, type Context } from "./supabase";
import { rpcError, HttpError } from "./http";
const schema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  selected: z.string().max(80).default(""),
  q: z.string().trim().max(200).default(""),
  status: z.string().max(40).default(""),
  method: z.enum(["", "pickup", "delivery"]).default(""),
  sort: z.enum(["", "newest", "oldest", "name"]).default(""),
  from: z.union([z.literal(""), z.iso.date()]).default(""),
  to: z.union([z.literal(""), z.iso.date()]).default(""),
});
export async function adminList(
  ctx: Context,
  resource: string,
  actorId: string,
) {
  const parsed = schema.safeParse(
    Object.fromEntries(new URL(ctx.request.url).searchParams),
  );
  if (!parsed.success)
    throw new HttpError(400, "Check the search filters and page number.");
  const filters = parsed.data;
  if (filters.from && filters.to && filters.to < filters.from)
    throw new HttpError(400, "End date must follow start date.");
  const { data, error } = await db(ctx.env).rpc("admin_list", {
    resource,
    filters,
    actor_id: actorId,
  });
  rpcError(error);
  return data as {
    items: Record<string, any>[];
    total: number;
    page: number;
    pageSize: number;
  };
}
