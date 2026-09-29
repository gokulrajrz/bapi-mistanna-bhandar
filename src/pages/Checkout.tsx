import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import { useCart } from "../lib/cart";
import { useCreateOrder } from "../lib/queries";
import { checkoutSchema } from "../lib/commerce";
import { isDemo, orders } from "../lib/api";
import { money } from "../lib/config";
import { useStoreContent } from "../lib/content";
import { useSession } from "../lib/auth";
import { api } from "../lib/request";
import { indiaToday } from "../../shared/validation";
import type { Checkout as Contact, Quote, Address } from "../lib/types";
import { Photo } from "../components/Photo";
import { Turnstile } from "../components/Turnstile";
const ATTEMPT = "bapi-checkout-attempt-v2";
function storedAttempt() {
  try {
    return JSON.parse(localStorage.getItem(ATTEMPT) || "null") as {
      requestId: string;
      quoteId: string;
    } | null;
  } catch {
    return null;
  }
}
export default function Checkout() {
  const cart = useCart(),
    navigate = useNavigate(),
    mutation = useCreateOrder(),
    session = useSession();
  const { content } = useStoreContent();
  const [quote, setQuote] = useState<Quote | null>(null),
    [attempt, setAttempt] = useState(storedAttempt),
    [token, setToken] = useState(""),
    [securityError, setSecurityError] = useState(""),
    [resetSecurity, setResetSecurity] = useState(0);
  const [form, setForm] = useState<Contact>(() => ({
    name: "",
    email: "",
    phone: "",
    address: "",
    pincode: "",
    method: "delivery",
    date: cart.items.find((i) => i.gift?.date)?.gift?.date || "",
    coupon: "",
    message: "",
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const account = useQuery({
    queryKey: ["account", session.data?.user?.id],
    queryFn: () => api<{ addresses: Address[] }>("/api/account"),
    enabled: !!session.data?.user,
  });
  const quoting = useMutation({
    mutationFn: () => orders.quote({ items: cart.items, contact: form }),
    onSuccess: setQuote,
  });
  function change(key: keyof Contact, value: string) {
    setForm({ ...form, [key]: value });
    setErrors({ ...errors, [key]: "" });
    setQuote(null);
  }
  function submit() {
    const result = checkoutSchema.safeParse(form);
    if (!result.success) {
      setErrors(
        Object.fromEntries(
          result.error.issues.map((i) => [i.path[0], i.message]),
        ),
      );
      setTimeout(
        () =>
          document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
        0,
      );
      return;
    }
    quoting.mutate();
  }
  function reserve() {
    const saved =
      attempt ||
      (quote ? { requestId: crypto.randomUUID(), quoteId: quote.id } : null);
    if (!saved) return;
    try {
      localStorage.setItem(ATTEMPT, JSON.stringify(saved));
    } catch {
      setSecurityError(
        "Enable browser storage so your checkout can recover safely.",
      );
      return;
    }
    setAttempt(saved);
    mutation.mutate(
      { ...saved, turnstileToken: token },
      {
        onSuccess: (order) => {
          localStorage.removeItem(ATTEMPT);
          setAttempt(null);
          if (isDemo) cart.clear();
          else {
            localStorage.setItem(
              `bapi-purchase-${order.id}`,
              JSON.stringify(
                cart.items.map((i) => ({ key: i.key, quantity: i.quantity })),
              ),
            );
            navigate(`/orders/${order.id}`);
          }
        },
        onError: () => {
          setToken("");
          setResetSecurity((v) => v + 1);
        },
      },
    );
  }
  const fields = (names: (keyof Contact)[]) =>
    names.map((name) => (
      <label key={name} htmlFor={`checkout-${name}`}>
        {
          (
            {
              name: "Full name",
              email: "Email address",
              phone: "Mobile number",
              address: "Delivery address",
              pincode: "Pincode",
              date:
                form.method === "pickup"
                  ? "Pickup date"
                  : "Preferred delivery date",
              message: "Gift message (optional)",
              coupon: "Coupon code",
            } as Record<string, string>
          )[name]
        }
        {name === "address" || name === "message" ? (
          <textarea
            id={`checkout-${name}`}
            value={form[name]}
            maxLength={500}
            aria-invalid={!!errors[name]}
            aria-describedby={errors[name] ? `error-${name}` : undefined}
            onChange={(e) => change(name, e.target.value)}
          />
        ) : (
          <input
            id={`checkout-${name}`}
            type={
              name === "email"
                ? "email"
                : name === "date"
                  ? "date"
                  : name === "phone"
                    ? "tel"
                    : "text"
            }
            autoComplete={
              name === "name"
                ? "name"
                : name === "phone"
                  ? "tel"
                  : name === "email"
                    ? "email"
                    : name === "pincode"
                      ? "postal-code"
                      : undefined
            }
            min={name === "date" ? indiaToday() : undefined}
            maxLength={name === "phone" ? 10 : name === "pincode" ? 6 : 254}
            inputMode={
              name === "phone" || name === "pincode" ? "numeric" : undefined
            }
            value={form[name]}
            aria-invalid={!!errors[name]}
            aria-describedby={errors[name] ? `error-${name}` : undefined}
            onChange={(e) => change(name, e.target.value)}
          />
        )}
        <small className="field-error" id={`error-${name}`}>
          {errors[name]}
        </small>
      </label>
    ));
  if (mutation.isSuccess && isDemo)
    return (
      <div className="section confirmation">
        <div className="confirmation-check">
          <Check size={36} />
        </div>
        <span className="eyebrow">A LITTLE PRACTICE RUN</span>
        <h1>That was sweet.</h1>
        <p>
          Your demo checkout is complete. No real order was placed and no
          payment was taken.
        </p>
        <p>
          Reference: <strong>{mutation.data.id}</strong>
        </p>
        <p>Total: {money(mutation.data.total)}</p>
        <Link className="button" to="/shop">
          Discover more sweets <ArrowRight size={17} />
        </Link>
      </div>
    );
  if (attempt && !quote && !isDemo)
    return (
      <div className="section confirmation">
        <h1>Let’s pick up where you left off.</h1>
        <p>
          Your previous checkout reference is saved. Resume it before starting
          another order so a slow connection cannot create a duplicate.
        </p>
        {content.turnstileSiteKey && (
          <Turnstile
            siteKey={content.turnstileSiteKey}
            onToken={setToken}
            onError={setSecurityError}
            resetKey={resetSecurity}
          />
        )}
        {securityError && <p role="alert">{securityError}</p>}
        <button
          className="button"
          disabled={mutation.isPending}
          onClick={() => reserve()}
        >
          Resume last checkout
        </button>
        {mutation.isError && (
          <>
            <p className="field-error" role="alert">
              {mutation.error.message}
            </p>
            {/expired|not found|changed/i.test(mutation.error.message) && (
              <button
                className="text-button"
                onClick={() => {
                  localStorage.removeItem(ATTEMPT);
                  setAttempt(null);
                  mutation.reset();
                }}
              >
                Review a new quote
              </button>
            )}
          </>
        )}
      </div>
    );
  if (!cart.items.length)
    return (
      <div className="section empty">
        <h1>Your bag is waiting.</h1>
        <p>Add something sweet before checking out.</p>
        <Link className="button" to="/shop">
          Shop sweets
        </Link>
      </div>
    );
  return (
    <div className="section checkout-page">
      <div className="page-intro">
        <span className="eyebrow">JUST A LITTLE CLOSER</span>
        <h1>Sweetness, on its way.</h1>
      </div>
      {isDemo && (
        <div className="notice">
          You’re exploring demo checkout. No real order or payment will be
          created. Try coupon SWEET10.
        </div>
      )}
      {!isDemo && !content.paymentEnabled && (
        <div className="notice">
          Online ordering is not open yet. You can check delivery and review a
          quote.
        </div>
      )}
      <div className="checkout-layout">
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (quote) reserve();
            else submit();
          }}
        >
          <div className="checkout-steps">
            <span className={!quote ? "active" : ""}>
              01 · Contact & delivery
            </span>
            <ArrowRight size={16} />
            <span className={quote ? "active" : ""}>02 · Review & payment</span>
          </div>
          {!quote ? (
            <fieldset disabled={quoting.isPending} className="checkout-fields">
              <h2>A little about you.</h2>
              {!session.data?.user && !isDemo && (
                <p>
                  <Link className="text-link" to="/account">
                    Sign in for saved addresses and order history
                  </Link>
                </p>
              )}
              {!!account.data?.addresses.length && (
                <label>
                  Use a saved address
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      const a = account.data?.addresses.find(
                        (a) => a.id === e.target.value,
                      );
                      if (a)
                        setForm({
                          ...form,
                          ...a,
                          email: session.data?.user?.email || form.email,
                        });
                    }}
                  >
                    <option value="">Choose an address</option>
                    {account.data.addresses.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label} · {a.pincode}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {fields(["name"])}
              <div className="form-grid">{fields(["email", "phone"])}</div>
              <h2>How shall we get it to you?</h2>
              <div className="delivery-options">
                <label>
                  <input
                    type="radio"
                    name="method"
                    checked={form.method === "delivery"}
                    onChange={() => change("method", "delivery")}
                  />
                  Deliver to my door
                </label>
                {content.commerce.pickupEnabled && (
                  <label>
                    <input
                      type="radio"
                      name="method"
                      checked={form.method === "pickup"}
                      onChange={() => change("method", "pickup")}
                    />
                    I’ll pick it up
                  </label>
                )}
              </div>
              {form.method === "delivery" && fields(["address", "pincode"])}
              {fields(["date", "message", "coupon"])}
            </fieldset>
          ) : (
            <div className="order-review">
              <h2>One last little look.</h2>
              <p>
                <strong>{form.name}</strong>
                <br />
                {form.email}
                <br />
                {form.phone}
              </p>
              <p>
                {form.method === "pickup"
                  ? content.settings.address
                  : form.address}
                <br />
                {form.pincode}
                <br />
                {quote.deliveryLabel} · {form.date}
              </p>
              <p>
                Your price is held until{" "}
                {new Date(quote.expiresAt).toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                . Availability is confirmed when stock is reserved.
              </p>
              {!attempt && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setQuote(null)}
                >
                  Edit details
                </button>
              )}
              <div className="notice">
                <ShieldCheck size={20} />
                <p>
                  {isDemo
                    ? "Demo payment only — you will not be charged."
                    : "Continue to secure payment. UPI, cards and net banking are handled by Razorpay."}
                </p>
              </div>
              {!isDemo && content.turnstileSiteKey && (
                <Turnstile
                  siteKey={content.turnstileSiteKey}
                  onToken={setToken}
                  onError={setSecurityError}
                  resetKey={resetSecurity}
                />
              )}
            </div>
          )}
          {(quoting.isError || mutation.isError || securityError) && (
            <p role="alert" className="field-error">
              {mutation.error?.message ||
                quoting.error?.message ||
                securityError}
            </p>
          )}
          {mutation.isError &&
            /expired|not found|changed/i.test(mutation.error.message) && (
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  localStorage.removeItem(ATTEMPT);
                  setAttempt(null);
                  setQuote(null);
                  mutation.reset();
                }}
              >
                Review a new quote
              </button>
            )}
          <button
            className="button full"
            disabled={
              quoting.isPending ||
              mutation.isPending ||
              (!!quote && !isDemo && (!token || !content.paymentEnabled))
            }
          >
            {quoting.isPending
              ? "Checking delivery and prices…"
              : mutation.isPending
                ? "Reserving your sweets…"
                : !quote
                  ? "Review my order"
                  : isDemo
                    ? "Complete demo checkout"
                    : "Continue to payment"}
            <ArrowRight size={17} />
          </button>
        </form>
        <aside className="checkout-summary">
          <h2>Your little collection.</h2>
          {(
            quote?.lines ||
            cart.items.map((i) => ({ ...i, unitPrice: i.price }))
          ).map((i, index) => (
            <div className="summary-item" key={`${i.variantId}-${index}`}>
              <Photo src={i.image} alt={i.name} />
              <span>
                {i.name}
                <small>
                  {i.label} · Qty {i.quantity}
                </small>
              </span>
              <strong>{money(i.quantity * i.unitPrice)}</strong>
            </div>
          ))}
          {quote ? (
            <>
              <div className="price-line">
                <span>Subtotal</span>
                <span>{money(quote.subtotal)}</span>
              </div>
              <div className="price-line">
                <span>Shipping</span>
                <span>
                  {quote.shipping ? money(quote.shipping) : "Complimentary"}
                </span>
              </div>
              {quote.discount > 0 && (
                <div className="price-line">
                  <span>Savings</span>
                  <span>−{money(quote.discount)}</span>
                </div>
              )}
              <div className="price-line total">
                <strong>Total</strong>
                <strong>{money(quote.total)}</strong>
              </div>
            </>
          ) : (
            <p className="muted">
              Enter your delivery details to get the current price, available
              delivery date, and applicable discounts from the store.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
