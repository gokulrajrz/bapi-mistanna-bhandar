import { db } from "../../../server/supabase";
import {
  endpoint,
  readBody,
  HttpError,
  response,
  rpcError,
} from "../../../server/http";
import { verifyHmac, confirmPayment } from "../../../server/razorpay";
export const onRequestPost = endpoint(async (ctx) => {
  const raw = await readBody(ctx.request, 262144);
  const signature = ctx.request.headers.get("X-Razorpay-Signature") || "";
  if (
    !ctx.env.RAZORPAY_WEBHOOK_SECRET ||
    !(await verifyHmac(ctx.env.RAZORPAY_WEBHOOK_SECRET, raw, signature))
  )
    throw new HttpError(400, "Invalid webhook signature.");
  const event = JSON.parse(raw);
  const id = ctx.request.headers.get("X-Razorpay-Event-Id");
  if (!id || id.length > 200)
    throw new HttpError(400, "Missing event identifier.");
  if (event.event === "payment.captured" || event.event === "order.paid") {
    const p = event.payload?.payment?.entity;
    if (!p || p.status !== "captured" || !Number.isSafeInteger(p.amount))
      throw new HttpError(400, "Invalid captured payment.");
    await confirmPayment(ctx.env, p, `webhook:${id}`);
  } else if (
    event.event === "refund.processed" ||
    event.event === "refund.failed"
  ) {
    const r = event.payload?.refund?.entity;
    if (!r) throw new HttpError(400, "Invalid refund event.");
    const client = db(ctx.env);
    const job = await client
      .from("refund_jobs")
      .select("*")
      .eq("payment_id", r.payment_id)
      .maybeSingle();
    rpcError(job.error);
    if (job.data) {
      if (job.data.amount !== r.amount)
        throw new HttpError(400, "Refund amount mismatch.");
      const result = await client.rpc("finish_refund", {
        target: job.data.id,
        gateway_id: r.id,
        refund_status: r.status,
      });
      rpcError(result.error);
    }
  }
  return response({ received: true });
});
