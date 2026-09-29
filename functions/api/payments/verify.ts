import { z } from "zod";
import {
  endpoint,
  originGuard,
  body,
  actor,
  ownedOrder,
  response,
  HttpError,
  throttle,
} from "../../../server/http";
import {
  verifyHmac,
  razorpay,
  confirmPayment,
  type GatewayPayment,
} from "../../../server/razorpay";
const schema = z.object({
  orderId: z.uuid(),
  razorpay_payment_id: z.string().regex(/^pay_[a-zA-Z0-9]+$/),
  razorpay_signature: z.string().regex(/^[a-f\d]{64}$/i),
});
export const onRequestPost = endpoint(async (ctx) => {
  originGuard(ctx);
  await throttle(ctx, "verify", 20);
  const input = await body(ctx.request, schema);
  const who = await actor(ctx);
  const order = await ownedOrder(ctx, who, input.orderId);
  if (
    !order.gateway_order_id ||
    !ctx.env.RAZORPAY_KEY_SECRET ||
    !(await verifyHmac(
      ctx.env.RAZORPAY_KEY_SECRET,
      `${order.gateway_order_id}|${input.razorpay_payment_id}`,
      input.razorpay_signature,
    ))
  )
    throw new HttpError(
      400,
      "Payment verification failed. Check your order status before trying again.",
    );
  const payment = await razorpay<GatewayPayment>(
    ctx.env,
    `/payments/${input.razorpay_payment_id}`,
  );
  if (payment.order_id !== order.gateway_order_id)
    throw new HttpError(400, "Payment does not belong to this order.");
  return response(
    { status: await confirmPayment(ctx.env, payment, `verify:${payment.id}`) },
    who,
  );
});
