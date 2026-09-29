import { db, json } from "../../server/supabase";
import {
  endpoint,
  originGuard,
  body,
  actor,
  throttle,
  rpcError,
  response,
  HttpError,
} from "../../server/http";
import { checkoutRequestSchema } from "../../shared/validation";
import { verifyTurnstile } from "../../server/razorpay";
export const onRequestPost = endpoint(async (ctx) => {
  originGuard(ctx);
  if (ctx.env.CHECKOUT_ENABLED !== "true")
    throw new HttpError(
      503,
      "Online ordering is not open yet. Please contact the store.",
    );
  const input = await body(ctx.request, checkoutRequestSchema);
  await throttle(ctx, "checkout", 10);
  const who = await actor(ctx);
  const client = db(ctx.env);
  // An already-created order is safe to recover without consuming another Turnstile token.
  const old = await client
    .from("orders")
    .select("id,quote_id,user_id,guest_hash,total,status,expires_at")
    .eq("request_id", input.requestId)
    .maybeSingle();
  rpcError(old.error);
  if (old.data) {
    if (
      !(
        (who.userId && old.data.user_id === who.userId) ||
        old.data.guest_hash === who.guestHash
      ) ||
      old.data.quote_id !== input.quoteId
    )
      throw new HttpError(409, "This checkout reference is unavailable.");
    return response(
      {
        id: old.data.id,
        total: old.data.total,
        status: old.data.status,
        expiresAt: old.data.expires_at,
      },
      who,
    );
  }
  const operations = await client
    .from("settings")
    .select("value")
    .eq("key", "operations")
    .single();
  rpcError(operations.error);
  if (
    !operations.data!.value.checkoutEnabled ||
    operations.data!.value.maintenanceMode
  )
    throw new HttpError(503, "The store is not accepting orders right now.");
  const settings = await client
    .from("settings")
    .select("value")
    .eq("key", "public")
    .single();
  rpcError(settings.error);
  if (
    !settings.data!.value.launchApproved ||
    !ctx.env.RAZORPAY_KEY_ID ||
    !ctx.env.RAZORPAY_KEY_SECRET
  )
    throw new HttpError(
      503,
      "Online ordering is not ready yet. No payment has been taken.",
    );
  await verifyTurnstile(ctx, input.turnstileToken);
  const { data, error } = await client.rpc("reserve_order", {
    quote: input.quoteId,
    request: input.requestId,
    actor_id: who.userId,
    guest: who.guestHash,
  });
  rpcError(error);
  return response(data, who, 201);
});
export function onRequestGet() {
  return json({ error: "Method not allowed." }, 405);
}
