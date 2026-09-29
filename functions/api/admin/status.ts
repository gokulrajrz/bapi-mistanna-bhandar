import { admin } from "../../../server/admin";
import { endpoint, response } from "../../../server/http";
export const onRequestGet = endpoint(async (ctx) => {
  const who = await admin(ctx);
  return response(
    {
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
