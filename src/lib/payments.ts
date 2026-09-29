import { api } from "./request";
type Result = { razorpay_payment_id: string; razorpay_signature: string };
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, callback: (error: unknown) => void) => void;
    };
  }
}
let loaded: Promise<void> | undefined;
async function loadGateway() {
  if (window.Razorpay) return;
  if (!loaded)
    loaded = new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = "https://checkout.razorpay.com/v1/checkout.js";
      el.async = true;
      el.onload = () => resolve();
      el.onerror = () => {
        loaded = undefined;
        reject(new Error("Unable to load secure payment. Please try again."));
      };
      document.head.append(el);
    });
  return loaded;
}
export async function payForOrder(
  id: string,
  name: string,
): Promise<{ status: string }> {
  const intent = await api<{
    key: string;
    orderId: string;
    amount: number;
    currency: string;
  }>(`/api/orders/${id}/payment`, { method: "POST" });
  await loadGateway();
  const result = await new Promise<Result>((resolve, reject) => {
    const checkout = new window.Razorpay!({
      key: intent.key,
      order_id: intent.orderId,
      amount: intent.amount,
      currency: intent.currency,
      name,
      description: "Handcrafted sweets from Assam",
      handler: resolve,
      modal: {
        ondismiss: () =>
          reject(
            new Error(
              "Payment was not completed. Your order can be resumed before the reservation expires.",
            ),
          ),
      },
      theme: { color: "#692c36" },
    });
    checkout.on("payment.failed", () =>
      reject(
        new Error(
          "Payment did not complete. Check the order status before retrying.",
        ),
      ),
    );
    checkout.open();
  });
  return api("/api/payments/verify", {
    method: "POST",
    body: JSON.stringify({ orderId: id, ...result }),
  });
}
