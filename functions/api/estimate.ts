import { db } from "../../server/supabase";
import {
  endpoint,
  originGuard,
  body,
  throttle,
  rpcError,
  response,
} from "../../server/http";
import { estimateRequestSchema } from "../../shared/validation";
// Read-only calculation: no customer record, checkout quote or stock reservation.
export const onRequestPost = endpoint(async (ctx) => {
  originGuard(ctx);
  const input = await body(ctx.request, estimateRequestSchema);
  await throttle(ctx, "estimate", 30);
  const { data, error } = await db(ctx.env).rpc("calculate_checkout", {
    payload: input,
  });
  rpcError(error);
  const { demands, ...summary } = data;
  return response(summary);
});
