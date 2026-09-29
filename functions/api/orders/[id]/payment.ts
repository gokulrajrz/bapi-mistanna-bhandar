import {
  endpoint,
  originGuard,
  actor,
  ownedOrder,
  response,
  throttle,
} from "../../../../server/http";
import { paymentIntent } from "../../../../server/razorpay";
export const onRequestPost = endpoint(async (ctx) => {
  originGuard(ctx);
  await throttle(ctx, "payment", 15);
  const who = await actor(ctx);
  const order = await ownedOrder(ctx, who, String(ctx.params.id));
  return response(await paymentIntent(ctx.env, order), who);
});
