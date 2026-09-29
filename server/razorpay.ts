import { db, type Env, type Context } from "./supabase";
import { HttpError, rpcError } from "./http";
export async function verifyHmac(
  secret: string,
  message: string,
  signature: string,
) {
  if (!/^[a-f\d]{64}$/i.test(signature)) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify(
    "HMAC",
    key,
    Uint8Array.from(signature.match(/../g)!, (v) => parseInt(v, 16)),
    new TextEncoder().encode(message),
  );
}
export async function razorpay<T>(
  env: Env,
  path: string,
  body?: unknown,
): Promise<T> {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET)
    throw new HttpError(
      503,
      "Online payment is not configured. No payment has been taken.",
    );
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Basic ${btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`)}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok)
    throw new HttpError(
      503,
      "The payment provider is temporarily unavailable. Your order can be resumed.",
    );
  return res.json() as Promise<T>;
}
export type GatewayPayment = {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: string;
  amount_refunded?: number;
};
type GatewayOrder = {
  id: string;
  receipt: string;
  amount: number;
  currency: string;
  status: string;
};
type GatewayRefund = {
  id: string;
  payment_id: string;
  amount: number;
  status: string;
  receipt?: string;
  notes?: Record<string, string>;
};
export async function paymentIntent(
  env: Env,
  order: {
    id: string;
    total: number;
    status: string;
    gateway_order_id?: string | null;
    expires_at: string;
    payment_lease_until?: string | null;
  },
) {
  if (
    order.status !== "pending_payment" ||
    new Date(order.expires_at).getTime() <= Date.now()
  )
    throw new HttpError(
      409,
      "This payment window has closed. Check your order status.",
    );
  if (order.gateway_order_id)
    return {
      key: env.RAZORPAY_KEY_ID,
      orderId: order.gateway_order_id,
      amount: Math.round(order.total * 100),
      currency: "INR",
    };
  const client = db(env);
  const lease = await client.rpc("claim_payment_order", { target: order.id });
  rpcError(lease.error);
  if (!lease.data)
    throw new HttpError(
      409,
      "Payment is being prepared. Please try again shortly.",
    );
  // Recover an ambiguous prior API result by our unique receipt before creating anything.
  const existing = await razorpay<{ items: GatewayOrder[] }>(
    env,
    `/orders?receipt=${encodeURIComponent(order.id)}&count=100`,
  );
  const exact = existing.items.filter((x) => x.receipt === order.id);
  if (exact.length > 1)
    throw new HttpError(
      409,
      "Payment needs reconciliation. Please contact the store.",
    );
  if (!exact[0] && order.payment_lease_until)
    throw new HttpError(
      409,
      "An earlier payment setup is still being reconciled. Please contact the store before starting another payment.",
    );
  const gateway =
    exact[0] ||
    (await razorpay<GatewayOrder>(env, "/orders", {
      amount: Math.round(order.total * 100),
      currency: "INR",
      receipt: order.id,
      notes: { store_order_id: order.id },
      partial_payment: false,
    }));
  if (
    gateway.amount !== Math.round(order.total * 100) ||
    gateway.currency !== "INR"
  )
    throw new HttpError(409, "Payment details do not match the order.");
  const saved = await client
    .from("orders")
    .update({ gateway_order_id: gateway.id, payment_lease_until: null })
    .eq("id", order.id)
    .is("gateway_order_id", null);
  rpcError(saved.error);
  return {
    key: env.RAZORPAY_KEY_ID,
    orderId: gateway.id,
    amount: gateway.amount,
    currency: gateway.currency,
  };
}
export async function confirmPayment(
  env: Env,
  payment: GatewayPayment,
  event: string,
) {
  if (payment.status !== "captured") return "pending_payment";
  const { data, error } = await db(env).rpc("record_captured_payment", {
    gateway_order: payment.order_id,
    payment: payment.id,
    paid_amount: payment.amount,
    paid_currency: payment.currency,
    event,
  });
  rpcError(error);
  return data as string;
}
export async function processRefund(
  env: Env,
  job: {
    id: string;
    order_id: string;
    payment_id: string;
    amount: number;
    gateway_refund_id?: string | null;
    attempts: number;
  },
) {
  const client = db(env);
  const lease = await client.rpc("claim_refund_job", { target: job.id });
  rpcError(lease.error);
  if (!lease.data) return;
  try {
    let refund: GatewayRefund | undefined;
    if (job.gateway_refund_id)
      refund = await razorpay<GatewayRefund>(
        env,
        `/refunds/${job.gateway_refund_id}`,
      );
    else {
      const list = await razorpay<{ items: GatewayRefund[] }>(
        env,
        `/payments/${job.payment_id}/refunds?count=100`,
      );
      refund = list.items.find(
        (r) => r.receipt === job.id || r.notes?.refund_job_id === job.id,
      );
      if (!refund) {
        const payment = await razorpay<GatewayPayment>(
          env,
          `/payments/${job.payment_id}`,
        );
        if ((payment.amount_refunded || 0) > 0) {
          await client
            .from("refund_jobs")
            .update({
              status: "needs_review",
              last_error: "An unlinked refund already exists for this payment.",
            })
            .eq("id", job.id);
          return;
        }
        // After an ambiguous request, never automatically issue a second refund.
        if (job.attempts > 0) {
          await client
            .from("refund_jobs")
            .update({
              status: "needs_review",
              last_error:
                "Prior refund attempt could not be reconciled. Check provider before retrying.",
            })
            .eq("id", job.id);
          return;
        }
        refund = await razorpay<GatewayRefund>(
          env,
          `/payments/${job.payment_id}/refund`,
          {
            amount: job.amount,
            speed: "normal",
            receipt: job.id,
            notes: { refund_job_id: job.id },
          },
        );
      }
    }
    if (refund.payment_id !== job.payment_id || refund.amount !== job.amount)
      throw new Error("refund_mismatch");
    const result = await client.rpc("finish_refund", {
      target: job.id,
      gateway_id: refund.id,
      refund_status: refund.status,
    });
    rpcError(result.error);
  } catch {
    await client
      .from("refund_jobs")
      .update({
        last_error:
          "Provider result is uncertain. Reconciliation will run before any retry.",
      })
      .eq("id", job.id);
  }
}
export async function maintenance(env: Env) {
  const client = db(env);
  // Reconcile known pending gateway payments before releasing expired reservations.
  const unlinked = await client
    .from("orders")
    .select("id,total")
    .is("gateway_order_id", null)
    .not("payment_lease_until", "is", null)
    .order("reconciled_at", { nullsFirst: true })
    .limit(3);
  rpcError(unlinked.error);
  if (env.RAZORPAY_KEY_ID)
    for (const order of unlinked.data || []) {
      try {
        const list = await razorpay<{ items: GatewayOrder[] }>(
          env,
          `/orders?receipt=${order.id}&count=100`,
        );
        const exact = list.items.filter(
          (g) =>
            g.receipt === order.id &&
            g.amount === Math.round(order.total * 100) &&
            g.currency === "INR",
        );
        if (exact.length === 1) {
          const saved = await client
            .from("orders")
            .update({ gateway_order_id: exact[0].id })
            .eq("id", order.id)
            .is("gateway_order_id", null);
          rpcError(saved.error);
        }
      } catch {
        console.error(
          JSON.stringify({
            operation: "gateway_order_reconciliation",
            orderId: order.id,
          }),
        );
      } finally {
        const result = await client
          .from("orders")
          .update({ reconciled_at: new Date().toISOString() })
          .eq("id", order.id);
        rpcError(result.error);
      }
    }
  const pending = await client
    .from("orders")
    .select("id,gateway_order_id")
    .in("status", ["pending_payment", "expired", "cancelled"])
    .not("gateway_order_id", "is", null)
    .order("reconciled_at", { nullsFirst: true })
    .limit(3);
  rpcError(pending.error);
  if (env.RAZORPAY_KEY_ID)
    for (const order of pending.data || []) {
      try {
        const payments = await razorpay<{ items: GatewayPayment[] }>(
          env,
          `/orders/${order.gateway_order_id}/payments`,
        );
        for (const payment of payments.items)
          if (payment.status === "captured")
            await confirmPayment(env, payment, `reconcile:${payment.id}`);
      } catch {
        console.error(
          JSON.stringify({
            operation: "payment_reconciliation",
            orderId: order.id,
          }),
        );
      } finally {
        const result = await client
          .from("orders")
          .update({ reconciled_at: new Date().toISOString() })
          .eq("id", order.id);
        rpcError(result.error);
      }
    }
  const expired = await client.rpc("expire_reservations");
  rpcError(expired.error);
  if (env.RAZORPAY_KEY_ID) {
    const jobs = await client
      .from("refund_jobs")
      .select("*")
      .in("status", ["queued", "processing"])
      .order("reconciled_at", { nullsFirst: true })
      .limit(3);
    rpcError(jobs.error);
    for (const job of jobs.data || []) {
      await processRefund(env, job);
      const result = await client
        .from("refund_jobs")
        .update({ reconciled_at: new Date().toISOString() })
        .eq("id", job.id);
      rpcError(result.error);
    }
    const submitted = await client
      .from("refund_jobs")
      .select("*")
      .eq("status", "submitted")
      .order("reconciled_at", { nullsFirst: true })
      .limit(3);
    rpcError(submitted.error);
    for (const job of submitted.data || []) {
      try {
        const refund = await razorpay<GatewayRefund>(
          env,
          `/refunds/${job.gateway_refund_id}`,
        );
        if (
          refund.payment_id === job.payment_id &&
          refund.amount === job.amount
        ) {
          const r = await client.rpc("finish_refund", {
            target: job.id,
            gateway_id: refund.id,
            refund_status: refund.status,
          });
          rpcError(r.error);
        }
      } catch {
        console.error(
          JSON.stringify({ operation: "refund_reconciliation", jobId: job.id }),
        );
      } finally {
        const result = await client
          .from("refund_jobs")
          .update({ reconciled_at: new Date().toISOString() })
          .eq("id", job.id);
        rpcError(result.error);
      }
    }
  }
  return { expired: expired.data };
}
export async function verifyTurnstile(ctx: Context, token: string) {
  if (!ctx.env.TURNSTILE_SECRET_KEY)
    throw new HttpError(503, "Checkout protection is not configured.");
  const res = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: ctx.env.TURNSTILE_SECRET_KEY,
        response: token,
        remoteip: ctx.request.headers.get("CF-Connecting-IP") || undefined,
      }),
      signal: AbortSignal.timeout(10000),
    },
  );
  const result = (await res.json()) as {
    success: boolean;
    hostname?: string;
    action?: string;
  };
  if (
    !result.success ||
    result.action !== "checkout" ||
    result.hostname !== new URL(ctx.request.url).hostname
  )
    throw new HttpError(403, "Please complete the security check again.");
}
