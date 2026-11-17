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
  return response(await adminList(ctx, "customers", who.userId!), who);
});
export const onRequestPut = endpoint(async (ctx) => {
  originGuard(ctx);
  const who = await admin(ctx);
  const input = await body(
    ctx.request,
    z.object({
      user_id: z.uuid(),
      name: z.string().trim().min(2).max(100),
      phone: z.string().regex(/^$|^[6-9]\d{9}$/),
      staff_notes: z.string().max(2000),
      revision: z.number().int().positive(),
    }),
  );
  const { data, error } = await db(ctx.env).rpc("admin_customer_update", {
    actor_id: who.userId,
    document: input,
  });
  rpcError(error);
  return response(data, who);
});
