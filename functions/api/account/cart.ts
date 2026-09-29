import { z } from "zod";
import { db } from "../../../server/supabase";
import { orderLineSchema } from "../../../shared/validation";
import {
  endpoint,
  actor,
  originGuard,
  body,
  response,
  rpcError,
} from "../../../server/http";
const line = orderLineSchema.extend({
  key: z.string().max(100),
  name: z.string().max(150),
  image: z.string().max(2048),
  label: z.string().max(100),
  price: z.number().nonnegative().max(1000000),
});
export const onRequestPut = endpoint(async (ctx) => {
  originGuard(ctx);
  const who = await actor(ctx, true);
  const input = await body(
    ctx.request,
    z.object({
      items: z.array(line).max(50),
      revision: z.number().int().min(1),
    }),
  );
  const { data, error } = await db(ctx.env).rpc("save_customer_cart", {
    actor_id: who.userId,
    cart_items: input.items,
    expected_revision: input.revision,
  });
  rpcError(error);
  return response(data, who);
});

export const onRequestGet = endpoint(async (ctx) => {
  const who = await actor(ctx, true);
  const { data, error } = await db(ctx.env)
    .from("customer_carts")
    .select("items,revision")
    .eq("user_id", who.userId!)
    .maybeSingle();
  rpcError(error);
  return response(data || { items: [], revision: 1 }, who);
});
