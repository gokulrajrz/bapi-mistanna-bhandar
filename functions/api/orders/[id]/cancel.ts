import { db } from "../../../../server/supabase";
import {
  endpoint,
  originGuard,
  actor,
  ownedOrder,
  response,
  rpcError,
  throttle,
} from "../../../../server/http";
export const onRequestPost = endpoint(async (ctx) => {
  originGuard(ctx);
  await throttle(ctx, "cancel", 10);
  const who = await actor(ctx);
  const order = await ownedOrder(ctx, who, String(ctx.params.id));
  const { data, error } = await db(ctx.env).rpc("cancel_store_order", {
    target: order.id,
    actor_id: who.userId,
    guest: who.guestHash,
  });
  rpcError(error);
  return response(data, who);
});
