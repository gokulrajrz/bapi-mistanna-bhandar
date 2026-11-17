import { db } from "../../../server/supabase";
import { admin } from "../../../server/admin";
import { endpoint, response, rpcError } from "../../../server/http";
export const onRequestGet = endpoint(async (ctx) => {
  const who = await admin(ctx);
  const health = await db(ctx.env).rpc("operations_health");
  rpcError(health.error);
  return response(
    {
      operationalHealth: health.data,
      role: who.role,
      supabase: !!ctx.env.SUPABASE_URL,
      payments: !!ctx.env.RAZORPAY_KEY_ID && !!ctx.env.RAZORPAY_KEY_SECRET,
      webhook: !!ctx.env.RAZORPAY_WEBHOOK_SECRET,
      turnstile: !!ctx.env.TURNSTILE_SECRET_KEY && !!ctx.env.TURNSTILE_SITE_KEY,
      infrastructureCheckoutEnabled: ctx.env.CHECKOUT_ENABLED === "true",
    },
    who,
  );
});
