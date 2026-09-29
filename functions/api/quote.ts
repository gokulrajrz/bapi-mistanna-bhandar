import { db } from "../../server/supabase";
import {
  endpoint,
  originGuard,
  body,
  actor,
  throttle,
  rpcError,
  response,
} from "../../server/http";
import { quoteRequestSchema } from "../../shared/validation";
export const onRequestPost = endpoint(async (ctx) => {
  originGuard(ctx);
  const input = await body(ctx.request, quoteRequestSchema);
  await throttle(ctx, "quote", 30);
  const who = await actor(ctx);
  const { data, error } = await db(ctx.env).rpc("make_quote", {
    payload: input,
    actor_id: who.userId,
    guest: who.guestHash,
  });
  rpcError(error);
  return response(data, who);
});
