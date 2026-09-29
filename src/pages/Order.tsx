import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/request";
import { payForOrder } from "../lib/payments";
import { useStoreContent } from "../lib/content";
import { useCart } from "../lib/cart";
import { money } from "../lib/config";
import type { OrderDetails } from "../lib/types";
import { ErrorState, Dialog } from "../components/ui";
import { Photo } from "../components/Photo";
const labels: Record<string, string> = {
  pending_payment: "Your sweets are reserved.",
  paid: "Payment confirmed.",
  preparing: "Something sweet is being made.",
  shipped: "Your order is on its way.",
  ready_for_pickup: "Ready for your visit.",
  completed: "Thank you for sharing the sweetness.",
  cancelled: "Your order was cancelled.",
  expired: "This payment window has closed.",
  refund_pending: "Your refund is being processed.",
  refunded: "Your refund has been processed.",
};
export default function Order() {
  const { id = "" } = useParams();
  const { content } = useStoreContent();
  const cart = useCart(),
    client = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const query = useQuery({
    queryKey: ["orders", id],
    queryFn: ({ signal }) => api<OrderDetails>(`/api/orders/${id}`, { signal }),
    refetchInterval: (q) =>
      ["pending_payment", "refund_pending"].includes(q.state.data?.status || "")
        ? 5000
        : false,
    retry: 1,
  });
  const refresh = () => client.invalidateQueries({ queryKey: ["orders", id] });
  const payment = useMutation({
    mutationFn: () => payForOrder(id, content.settings.name),
    onSettled: refresh,
  });
  const cancel = useMutation({
    mutationFn: () => api(`/api/orders/${id}/cancel`, { method: "POST" }),
    onSuccess: async () => {
      setConfirm(false);
      await refresh();
      await client.invalidateQueries({ queryKey: ["products"] });
      await client.invalidateQueries({ queryKey: ["account"] });
    },
  });
  const order = query.data;
  useEffect(() => {
    if (
      !order ||
      ![
        "paid",
        "preparing",
        "shipped",
        "ready_for_pickup",
        "completed",
      ].includes(order.status)
    )
      return;
    try {
      const key = `bapi-purchase-${id}`;
      const purchased = JSON.parse(localStorage.getItem(key) || "[]") as {
        key: string;
        quantity: number;
      }[];
      for (const item of purchased) {
        const current = cart.items.find((i) => i.key === item.key);
        if (current)
          cart.update(item.key, Math.max(0, current.quantity - item.quantity));
      }
      localStorage.removeItem(key);
    } catch {
      /* Keep bag editable if browser storage is unavailable. */
    }
  }, [order?.status, id]);
  if (query.isPending)
    return (
      <div className="section" role="status">
        Checking your order…
      </div>
    );
  if (query.isError)
    return (
      <div className="section">
        <ErrorState retry={() => query.refetch()} />
        <p role="alert">{query.error.message}</p>
        <Link to="/account">Sign in to view your orders</Link>
      </div>
    );
  if (!order) return null;
  return (
    <div className="section order-page">
      <div className="page-intro">
        <span className="eyebrow">
          YOUR ORDER · {id.slice(0, 8).toUpperCase()}
        </span>
        <h1>{labels[order.status] || "Your order"}</h1>
        <p aria-live="polite">
          {order.status === "pending_payment"
            ? `Complete payment before ${new Date(order.expiresAt).toLocaleString("en-IN")}. No payment has been confirmed yet.`
            : order.status === "refund_pending"
              ? "A full refund has been queued. Updates will appear here."
              : `Order placed ${new Date(order.createdAt).toLocaleString("en-IN")}`}
        </p>
      </div>
      <div className="checkout-layout">
        <div>
          <ol className="order-timeline">
            {order.events.map((e) => (
              <li key={e.id}>
                <strong>{e.description}</strong>
                <time>{new Date(e.created_at).toLocaleString("en-IN")}</time>
              </li>
            ))}
          </ol>
          {order.tracking?.reference && (
            <p>
              Tracking: {order.tracking.carrier} · {order.tracking.reference}{" "}
              {order.tracking.url && /^https:\/\//.test(order.tracking.url) && (
                <a href={order.tracking.url} target="_blank" rel="noreferrer">
                  Track delivery ↗
                </a>
              )}
            </p>
          )}
          <h2>Delivery details</h2>
          <p>
            {order.contact.name}
            <br />
            {order.contact.method === "pickup"
              ? content.settings.address
              : order.contact.address}
            <br />
            {order.contact.pincode}
            <br />
            {order.contact.date}
          </p>
          {order.status === "pending_payment" && (
            <button
              className="button"
              disabled={payment.isPending}
              onClick={() => payment.mutate()}
            >
              {payment.isPending
                ? "Opening secure payment…"
                : `Pay ${money(order.total)}`}
            </button>
          )}
          {["pending_payment", "paid"].includes(order.status) && (
            <button className="text-button" onClick={() => setConfirm(true)}>
              Cancel order
            </button>
          )}
          {payment.isError && (
            <p role="alert" className="field-error">
              {payment.error.message}
            </p>
          )}
          <p>
            <Link to="/account">View all your orders</Link>
          </p>
        </div>
        <aside className="checkout-summary">
          <h2>Your little collection.</h2>
          {order.items.map((i, index) => (
            <div key={index} className="summary-item">
              <Photo src={i.snapshot.image} alt={i.snapshot.name} />
              <span>
                {i.snapshot.name}
                <small>
                  {i.snapshot.label} · {i.quantity}
                </small>
              </span>
              <strong>{money(i.unit_price * i.quantity)}</strong>
            </div>
          ))}
          <div className="price-line">
            <span>Shipping</span>
            <span>{money(order.shipping)}</span>
          </div>
          <div className="price-line">
            <span>Savings</span>
            <span>{money(order.discount)}</span>
          </div>
          <div className="price-line total">
            <strong>Total</strong>
            <strong>{money(order.total)}</strong>
          </div>
        </aside>
      </div>
      {confirm && (
        <Dialog title="Cancel this order?" onClose={() => setConfirm(false)}>
          <p>
            {order.status === "paid"
              ? "Your cancellation will request a full refund. Bank processing times apply."
              : "Your reserved stock will be released."}
          </p>
          <button
            className="button"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate()}
          >
            {cancel.isPending ? "Cancelling…" : "Confirm cancellation"}
          </button>
          {cancel.isError && (
            <p className="field-error" role="alert">
              {cancel.error.message}
            </p>
          )}
        </Dialog>
      )}
    </div>
  );
}
