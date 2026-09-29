import { z } from "zod";
import { db } from "../../../server/supabase";
import { admin } from "../../../server/admin";
import {
  endpoint,
  response,
  body,
  originGuard,
  rpcError,
} from "../../../server/http";
export const onRequestGet = endpoint(async (ctx) => {
  const who = await admin(ctx);
  const page = Math.max(
    1,
    Math.floor(Number(new URL(ctx.request.url).searchParams.get("page")) || 1),
  );
  const { data, error, count } = await db(ctx.env)
    .from("orders")
    .select("id,total,status,contact,created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * 50, page * 50 - 1);
  rpcError(error);
  return response(
    {
      items: data,
      total: count || 0,
      page,
      pageSize: 50,
    },
    who,
  );
});
export const onRequestPatch = endpoint(async (ctx) => {
  originGuard(ctx);
  const who = await admin(ctx);
  const input = await body(
    ctx.request,
    z.object({
      id: z.uuid(),
      status: z.enum([
        "preparing",
        "shipped",
        "ready_for_pickup",
        "completed",
        "cancelled",
      ]),
      tracking: z
        .object({
          carrier: z.string().max(100),
          reference: z.string().max(100),
          url: z.union([
            z.literal(""),
            z.url().refine((v) => v.startsWith("https://")),
          ]),
        })
        .optional(),
    }),
  );
  if (input.status === "cancelled") {
    const { data, error } = await db(ctx.env).rpc("admin_cancel_order", {
      target: input.id,
      actor_id: who.userId,
    });
    rpcError(error);
    return response(data, who);
  }
  const { error } = await db(ctx.env).rpc("transition_order", {
    target: input.id,
    next_status: input.status,
    tracking_data: input.tracking || null,
    admin_id: who.userId,
  });
  rpcError(error);
  return response({ updated: true }, who);
});
