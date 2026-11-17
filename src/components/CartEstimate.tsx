import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useCart } from "../lib/cart";
import { useStoreContent } from "../lib/content";
import { api } from "../lib/request";
import { isDemo } from "../lib/api";
import { productQueries } from "../lib/queries";
import { availableVariant } from "../lib/products";
import { money } from "../lib/config";
import type { Quote } from "../lib/types";
import { Photo } from "./Photo";
import type { DeliveryPreferences as Delivery } from "../lib/delivery-preferences";
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export function CartEstimate() {
  const { items, setOpen, delivery, setDelivery } = useCart();
  const { content } = useStoreContent();
  const [form, setForm] = useState<Delivery>({
    ...delivery,
    date: delivery.date || today(),
  });
  const [submitted, setSubmitted] = useState<Delivery | null>(null);
  const estimate = useQuery({
    queryKey: ["cart-estimate", items, submitted],
    enabled: !!submitted && items.length > 0,
    staleTime: 0,
    retry: false,
    queryFn: async ({ signal }) => {
      const input = { items, contact: submitted! };
      if (!isDemo)
        return api<Quote>("/api/estimate", {
          method: "POST",
          body: JSON.stringify(input),
          signal,
        });
      const { seedProducts } = await import("../data/products");
      const { totals, boxPrice } = await import("../lib/commerce");
      if (submitted!.coupon && submitted!.coupon.toUpperCase() !== "SWEET10")
        throw Error("This demo coupon is invalid. Try SWEET10.");
      const validated = items.map((i) => {
        const p = seedProducts.find((p) => p.id === i.productId),
          v = p?.variants.find((v) => v.id === i.variantId);
        if (!i.box && (!v || v.stock < i.quantity))
          throw Error("An item is unavailable.");
        return {
          ...i,
          price: i.box
            ? boxPrice(
                i.box.pieces,
                seedProducts,
                i.gift?.wrap,
                content.commerce,
              )
            : v!.price + (i.gift?.wrap ? content.commerce.wrapFee : 0),
        };
      });
      return {
        ...totals(
          validated,
          submitted!.method,
          submitted!.pincode,
          submitted!.coupon.toUpperCase(),
        ),
        earliestDate: submitted!.date,
        deliveryLabel: "Demo estimate",
      } as Quote;
    },
  });
  const recommendations = useQuery({
    ...productQueries.page({ featured: true, pageSize: 8 }),
    enabled: content.storefront.experience.cartRecommendations,
  });
  const suggestions =
    (content.storefront.experience.cartRecommendations
      ? recommendations.data?.items
      : undefined
    )
      ?.filter(
        (p) =>
          !items.some((i) => i.productId === p.id) &&
          availableVariant(p)?.stock,
      )
      .slice(0, 2) || [];
  const change = (key: keyof Delivery, value: string) => {
    const next = { ...form, [key]: value };
    setForm(next);
    setDelivery(next);
    setSubmitted(null);
  };
  return (
    <>
      <form
        className="cart-estimate"
        onSubmit={(e) => {
          e.preventDefault();
          setDelivery({ ...form });
          if (submitted && JSON.stringify(submitted) === JSON.stringify(form))
            void estimate.refetch();
          else setSubmitted({ ...form });
        }}
      >
        <h3>Delivery & total</h3>
        <label>
          Fulfilment
          <select
            value={form.method}
            onChange={(e) => change("method", e.target.value)}
          >
            <option value="delivery">Delivery</option>
            {content.commerce.pickupEnabled && (
              <option value="pickup">Store pickup</option>
            )}
          </select>
        </label>
        {form.method === "delivery" && (
          <label>
            Pincode
            <input
              required
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={form.pincode}
              onChange={(e) => change("pincode", e.target.value)}
            />
          </label>
        )}
        <label>
          Preferred date
          <input
            type="date"
            required
            min={today()}
            value={form.date}
            onChange={(e) => change("date", e.target.value)}
          />
        </label>
        <label>
          Coupon (optional)
          <input
            maxLength={40}
            value={form.coupon}
            onChange={(e) => change("coupon", e.target.value)}
          />
        </label>
        <button
          type="submit"
          className="button outline"
          disabled={estimate.isFetching}
        >
          {estimate.isFetching ? "Calculating…" : "Calculate total"}
        </button>
      </form>
      {submitted && estimate.isError && (
        <p role="alert">
          {estimate.error.message}{" "}
          <button className="text-button" onClick={() => estimate.refetch()}>
            Try again
          </button>
        </p>
      )}
      {submitted &&
        estimate.data &&
        !estimate.isFetching &&
        !estimate.isError && (
          <section className="cart-summary" aria-live="polite">
            <div>
              <span>Subtotal</span>
              <span>{money(estimate.data.subtotal)}</span>
            </div>
            <div>
              <span>Shipping</span>
              <span>{money(estimate.data.shipping)}</span>
            </div>
            <div>
              <span>Discount</span>
              <span>−{money(estimate.data.discount)}</span>
            </div>
            <div>
              <strong>Estimated total</strong>
              <strong>{money(estimate.data.total)}</strong>
            </div>
            <p>
              {estimate.data.deliveryLabel} · Earliest date:{" "}
              {estimate.data.earliestDate}
            </p>
            <small>
              Revalidated at checkout. Stock is reserved only when you place the
              order.
            </small>
          </section>
        )}
      {!!suggestions.length && (
        <section className="cart-recommendations">
          <h3>{content.storefront.experience.cartRecommendationsTitle}</h3>
          {suggestions.map((p) => (
            <Link
              key={p.id}
              to={`/products/${p.slug}`}
              onClick={() => setOpen(false)}
            >
              <Photo src={p.image} alt="" />
              <span>
                {p.name}
                <small>{money(availableVariant(p)!.price)}</small>
              </span>
            </Link>
          ))}
        </section>
      )}
    </>
  );
}
