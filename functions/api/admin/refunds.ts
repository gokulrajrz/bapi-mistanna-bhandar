import { z } from "zod";
import { db } from "../../../server/supabase";
import { admin } from "../../../server/admin";
import {
  endpoint,
  originGuard,
  body,
  response,
  rpcError,
  HttpError,
} from "../../../server/http";
import { razorpay } from "../../../server/razorpay";
export const onRequestPost = endpoint(async (ctx) => {
  originGuard(ctx);
  const who = await admin(ctx);
  const input = await body(ctx.request, z.object({ id: z.uuid() }));
  const c = db(ctx.env);
  const { data: job, error } = await c
    .from("refund_jobs")
    .select("*")
    .eq("id", input.id)
    .single();
  rpcError(error);
  if (!job) throw new HttpError(404, "Refund not found.");
  const list = await razorpay<{
    items: {
      id: string;
      receipt: string;
      notes?: { refund_job_id?: string };
      amount: number;
      status: string;
    }[];
  }>(ctx.env, `/payments/${job.payment_id}/refunds?count=100`);
  const found = list.items.find(
    (x) =>
      x.id === job.gateway_refund_id ||
      x.receipt === job.id ||
      x.notes?.refund_job_id === job.id,
  );
  if (!found)
    throw new HttpError(
      409,
      "No matching refund was found. Review this payment in Razorpay before taking further action.",
    );
  if (found.amount !== job.amount)
    throw new HttpError(
      409,
      "Refund amount mismatch. Manual reconciliation is required.",
    );
  const result = await c.rpc("finish_refund", {
    target: job.id,
    gateway_id: found.id,
    refund_status: found.status,
  });
  rpcError(result.error);
  await c.from("admin_audit").insert({
    user_id: who.userId,
    action: "reconcile_refund",
    resource: job.id,
  });
  return response({ status: found.status }, who);
});
