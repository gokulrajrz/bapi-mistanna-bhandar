import { db } from "../../../server/supabase";
import { z } from "zod";
import {
  HttpError,
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

export const onRequestGet = endpoint(async (ctx) => {
  const params = new URL(ctx.request.url).searchParams;
  const parsed = z
    .object({ createdAt: z.iso.datetime({ offset: true }), id: z.uuid() })
    .safeParse({ createdAt: params.get("before"), id: params.get("beforeId") });
  const hasCursor = params.has("before") || params.has("beforeId");
  if (hasCursor && !parsed.success)
    throw new HttpError(400, "Invalid review cursor.");
  const { data, error } = await db(ctx.env).rpc("review_page", {
    product: String(ctx.params.id),
    before_at: hasCursor && parsed.success ? parsed.data.createdAt : null,
    before_id: hasCursor && parsed.success ? parsed.data.id : null,
  });
  rpcError(error);
  return response(data);
});
