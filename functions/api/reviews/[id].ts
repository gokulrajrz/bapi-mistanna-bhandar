import { db, json, type Context } from "../../../server/supabase";
export async function onRequestGet({ env, params }: Context) {
  try {
    const { data, error } = await db(env)
      .from("reviews")
      .select("id,name,rating,body,created_at,verified")
      .eq("product_id", params.id)
      .eq("published", true)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return json(data);
  } catch {
    return json({ error: "Reviews could not be loaded." }, 503);
  }
}

import { z } from "zod";
import {
  actor,
  body,
  endpoint,
  originGuard,
  response,
  rpcError,
  throttle,
} from "../../../server/http";
export const onRequestPost = endpoint(async (ctx) => {
  originGuard(ctx);
  const who = await actor(ctx, true);
  await throttle(ctx, "review", 5);
  const input = await body(
    ctx.request,
    z.object({
      name: z.string().trim().min(2).max(100),
      rating: z.number().int().min(1).max(5),
      body: z.string().trim().min(10).max(2000),
    }),
  );
  const { data, error } = await db(ctx.env).rpc("submit_review", {
    actor_id: who.userId,
    product: String(ctx.params.id),
    reviewer: input.name,
    stars: input.rating,
    review_body: input.body,
  });
  rpcError(error);
  return response({ id: data, pendingModeration: true }, who, 201);
});
