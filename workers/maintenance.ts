import { maintenance } from "../server/razorpay";
import { db, type Env } from "../server/supabase";
import { rpcError } from "../server/http";
export default {
  async scheduled(_event: unknown, env: Env) {
    const client = db(env),
      now = new Date().toISOString();
    try {
      const result = await maintenance(env);
      const saved = await client
        .from("service_health")
        .upsert({
          name: "maintenance",
          status: "healthy",
          last_attempt_at: now,
          last_success_at: now,
          details: { expiredReservations: result.expired },
        });
      rpcError(saved.error);
      const health = await client.rpc("operations_health");
      rpcError(health.error);
      if (
        health.data.overdueReservations > 0 ||
        health.data.refundsNeedingReview > 0 ||
        health.data.agedRefunds > 0
      )
        console.error(
          JSON.stringify({
            operation: "commerce_backlog",
            overdueReservations: health.data.overdueReservations,
            refundsNeedingReview: health.data.refundsNeedingReview,
            agedRefunds: health.data.agedRefunds,
          }),
        );
    } catch (error) {
      await client
        .from("service_health")
        .upsert({
          name: "maintenance",
          status: "failed",
          last_attempt_at: now,
          details: { error: "Maintenance failed; inspect Cloudflare logs." },
        });
      console.error(JSON.stringify({ operation: "maintenance_failed" }));
      throw error;
    }
  },
};
