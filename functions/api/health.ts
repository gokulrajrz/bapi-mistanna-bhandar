import { db } from "../../server/supabase";
import { endpoint, response, rpcError } from "../../server/http";
export const onRequestGet = endpoint(async (ctx) => {
  const { data, error } = await db(ctx.env).rpc("operations_health");
  rpcError(error);
  const heartbeat = data?.maintenance;
  const healthy =
    heartbeat?.status === "healthy" &&
    Date.parse(heartbeat.last_success_at) > Date.now() - 15 * 60 * 1000 &&
    data.overdueReservations === 0 &&
    data.agedRefunds === 0 &&
    data.refundsNeedingReview === 0;
  return response(
    { status: healthy ? "healthy" : "degraded" },
    undefined,
    healthy ? 200 : 503,
  );
});
