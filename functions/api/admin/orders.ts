import { adminList } from "../../../server/admin-list";
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
  return response(await adminList(ctx, "orders", who.userId!), who);
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
