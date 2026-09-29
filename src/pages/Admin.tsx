import { useEffect, useState, useId } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  ArrowLeft,
  Plus,
  Check,
  Search,
  ImagePlus,
  ShieldCheck,
} from "lucide-react";
import { useSession } from "../lib/auth";
import { isDemo } from "../lib/api";
import { api } from "../lib/request";
import {
  adminApi,
  adminResources,
  freshRecord,
  type Json,
  type AdminRecord,
} from "../lib/admin";
import { SignIn } from "../components/SignIn";
import { Dialog, ErrorState } from "../components/ui";
import { resourceSchemas, settingsSchemas } from "../../shared/admin-schema";
import { money } from "../lib/config";
const labels: Record<string, string> = {
  sort_order: "Display order",
  piece_price: "Price per piece",
  pieces: "Available individual pieces",
  stock: "Available packs (excludes reservations)",
  active: "Available / active",
  launchApproved: "Business details reviewed — approve launch",
  checkoutEnabled: "Accept online orders",
  maintenanceMode: "Maintenance mode",
  reservationMinutes: "Payment reservation window (minutes)",
  freeShipping: "Free shipping from (₹)",
  max_days: "Maximum transit days",
  min_days: "Earliest delivery (days)",
  same_day_cutoff: "Same-day cutoff hour (India time)",
  refrigerated: "Refrigerated delivery",
  user_id: "Supabase user ID",
  product_ids: "Products in this collection",
  starts_at: "Campaign starts (ISO timestamp)",
  ends_at: "Campaign ends (ISO timestamp)",
  expires_at: "Coupon expiry (ISO timestamp; blank means no expiry)",
  image: "Image URL",
  hero: "Hero image",
  heroImage: "Homepage image",
  phone: "Phone / WhatsApp with country code",
  role: "Administrator role",
};
const label = (key: string) =>
  labels[key] ||
  key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/^./, (s) => s.toUpperCase());
function Editor({
  value,
  onChange,
  path = "",
  readonlyId = false,
}: {
  value: Json;
  onChange: (v: Json) => void;
  path?: string;
  readonlyId?: boolean;
}) {
  const fieldId = useId();
  if (Array.isArray(value))
    return (
      <fieldset className="admin-array">
        <legend>{label(path.split(".").at(-1) || "Items")}</legend>
        {value.map((v, i) => (
          <div className="admin-array-row" key={i}>
            <Editor
              value={v}
              onChange={(next) =>
                onChange(value.map((x, j) => (i === j ? next : x)))
              }
              path={`${path}.${i}`}
            />
            <button
              type="button"
              className="text-button"
              aria-label={`Remove ${path} item ${i + 1}`}
              onClick={() => onChange(value.filter((_, j) => j !== i))}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="text-button"
          onClick={() => {
            const key = path.split(".").at(-1);
            const next =
              key === "variants"
                ? {
                    id: crypto.randomUUID(),
                    label: "",
                    price: 0,
                    stock: 0,
                    sort_order: value.length,
                  }
                : key === "policies"
                  ? { title: "", body: "" }
                  : key === "navigation"
                    ? { label: "", to: "/shop" }
                    : typeof value[0] === "object" && value[0] !== null
                      ? Object.fromEntries(
                          Object.entries(value[0]).map(([k, v]) => [
                            k,
                            typeof v === "boolean"
                              ? false
                              : typeof v === "number"
                                ? 0
                                : "",
                          ]),
                        )
                      : "";
            onChange([...value, next]);
          }}
        >
          + Add {path.split(".").at(-1)}
        </button>
      </fieldset>
    );
  if (value !== null && typeof value === "object")
    return (
      <div className={path ? "admin-field-group" : "admin-fields"}>
        {Object.entries(value).map(([key, v]) => (
          <Editor
            key={key}
            value={v}
            path={path ? `${path}.${key}` : key}
            readonlyId={readonlyId}
            onChange={(next) => onChange({ ...value, [key]: next })}
          />
        ))}
      </div>
    );
  const key = path.split(".").at(-1) || "",
    name = label(key);
  if (typeof value === "boolean")
    return (
      <label className="check-label admin-checkbox">
        <input
          type="checkbox"
          checked={value}
          onChange={(e) => onChange(e.target.checked)}
        />
        {name}
      </label>
    );
  const long =
    /description|body|paragraph|message|instructions|announcement|title/i.test(
      key,
    );
  const isImage =
    /^(image|hero|heroImage|socialImage)$/.test(key) ||
    path.includes("gallery.");
  return (
    <label htmlFor={fieldId} className={`admin-field ${long ? "wide" : ""}`}>
      {name}
      {key === "role" ? (
        <select
          id={fieldId}
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="manager">Manager</option>
          <option value="owner">Owner</option>
        </select>
      ) : long ? (
        <textarea
          id={fieldId}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          rows={key === "body" ? 8 : 3}
        />
      ) : (
        <input
          id={fieldId}
          type={
            typeof value === "number"
              ? "number"
              : key.toLowerCase().includes("color")
                ? "color"
                : "text"
          }
          step={typeof value === "number" ? "0.01" : undefined}
          value={value ?? ""}
          readOnly={readonlyId && key === "id"}
          onChange={(e) =>
            onChange(
              typeof value === "number"
                ? Number(e.target.value)
                : key === "expires_at" && !e.target.value
                  ? null
                  : e.target.value,
            )
          }
        />
      )}{" "}
      {isImage && <Upload onUploaded={(url) => onChange(url)} />}
    </label>
  );
}
function Upload({ onUploaded }: { onUploaded: (url: string) => void }) {
  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (isDemo)
        throw new Error(
          "Uploads require a connected backend. This preview does not upload files.",
        );
      const data = new FormData();
      data.append("file", file);
      return api<{ url: string }>("/api/admin/upload", {
        method: "POST",
        body: data,
      });
    },
    onSuccess: (d) => onUploaded(d.url),
  });
  return (
    <span className="upload-control">
      <ImagePlus size={15} />
      <input
        aria-label="Upload image"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        disabled={upload.isPending}
        onChange={(e) => {
          if (e.target.files?.[0]) upload.mutate(e.target.files[0]);
        }}
      />
      {upload.isPending && "Uploading…"}
      {upload.isError && <span role="alert">{upload.error.message}</span>}
    </span>
  );
}
function normalized(resource: string, row: AdminRecord): AdminRecord {
  if (resource === "products") {
    const data = row.data as AdminRecord;
    const variants = (row.product_variants || row.variants) as AdminRecord[];
    const inv = Array.isArray(row.inventory) ? row.inventory[0] : row.inventory;
    return {
      id: row.id,
      slug: row.slug,
      active: row.active,
      sort_order: row.sort_order,
      data: {
        name: data.name,
        description: data.description,
        category: data.category,
        image: data.image,
        gallery: data.gallery,
        ingredients: data.ingredients,
        allergens: data.allergens,
        tags: data.tags,
        shelfLife: data.shelfLife,
        shelfLifeDays: data.shelfLifeDays,
        requiresRefrigeration: data.requiresRefrigeration,
        featured: data.featured,
        createdAt: data.createdAt,
      },
      variants: variants
        .filter((v) => v.active !== false)
        .map(({ id, label, price, stock, sort_order }) => ({
          id,
          label,
          price,
          stock,
          sort_order,
        })),
      inventory: {
        piece_price: (inv as AdminRecord).piece_price,
        pieces: (inv as AdminRecord).pieces,
      },
    };
  }
  if (resource === "reviews") return { id: row.id, published: row.published };
  return row;
}
export default function Admin() {
  const session = useSession();
  if (!isDemo && session.isPending)
    return (
      <div className="section" role="status">
        Checking administrator access…
      </div>
    );
  if (!isDemo && !session.data?.user)
    return (
      <div className="section auth-card">
        <h1>Store administration</h1>
        <SignIn />
      </div>
    );
  if (!isDemo && !session.data?.role)
    return (
      <div className="section empty">
        <h1>Administrator access required.</h1>
        <p>Your account has not been assigned a store role.</p>
        <Link to="/account">Return to your account</Link>
      </div>
    );
  return <AdminWorkspace role={isDemo ? "owner" : session.data!.role!} />;
}
function AdminWorkspace({ role }: { role: "owner" | "manager" }) {
  const [params, setParams] = useSearchParams();
  const resource = params.get("section") || "overview";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [editing, setEditing] = useState<AdminRecord | null>(null),
    [validation, setValidation] = useState(""),
    [search, setSearch] = useState(""),
    [saved, setSaved] = useState("");
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["admin", resource, page],
    queryFn: () => adminApi.list(resource, page),
    enabled: resource !== "overview",
  });
  const status = useQuery({
    queryKey: ["admin", "status"],
    queryFn: () =>
      isDemo
        ? Promise.resolve({
            supabase: false,
            payments: false,
            webhook: false,
            turnstile: false,
            infrastructureCheckoutEnabled: false,
          })
        : api<Record<string, boolean>>("/api/admin/status"),
  });
  const mutation = useMutation({
    mutationFn: (record: AdminRecord) => adminApi.save(resource, record),
    onSuccess: async () => {
      setEditing(null);
      setSaved(
        isDemo
          ? "Saved in this admin preview only. Live storefront data is unchanged."
          : "Changes published.",
      );
      await Promise.all([
        client.invalidateQueries({ queryKey: ["admin"] }),
        client.invalidateQueries({ queryKey: ["content"] }),
        client.invalidateQueries({ queryKey: ["products"] }),
        client.invalidateQueries({ queryKey: ["reviews"] }),
      ]);
    },
  });
  useEffect(() => {
    setEditing(null);
    setValidation("");
    setSaved("");
    setSearch("");
  }, [resource]);
  const title =
    adminResources.find(([key]) => key === resource)?.[1] || "Management";
  const rows = (query.data?.items || []).filter((r) =>
    JSON.stringify(r).toLowerCase().includes(search.toLowerCase()),
  );
  const readonly = ["orders", "refund_jobs", "admin_audit"].includes(resource);
  function save() {
    if (!editing) return;
    const parsed =
      resource === "settings"
        ? settingsSchemas[
            editing.key as keyof typeof settingsSchemas
          ]?.safeParse(editing.value)
        : resourceSchemas[resource as keyof typeof resourceSchemas]?.safeParse(
            editing,
          );
    if (!parsed?.success) {
      setValidation(
        parsed?.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("\n") || "This resource cannot be edited.",
      );
      return;
    }
    mutation.mutate(
      resource === "settings"
        ? { key: editing.key, value: parsed.data as Json }
        : (parsed.data as unknown as AdminRecord),
    );
  }
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link to="/" className="admin-brand">
          Bapi <span>Store studio</span>
        </Link>
        <nav aria-label="Admin sections">
          {adminResources
            .filter(
              ([key]) =>
                role === "owner" ||
                !["settings", "admin_users", "admin_audit"].includes(key),
            )
            .map(([key, label]) => (
              <button
                className={resource === key ? "active" : ""}
                key={key}
                onClick={() => setParams({ section: key })}
              >
                {label}
              </button>
            ))}
        </nav>
        <Link className="admin-back" to="/">
          <ArrowLeft size={15} /> Back to storefront
        </Link>
      </aside>
      <main className="admin-main">
        <header className="admin-top">
          <div>
            <span className="eyebrow">BAPI MISTANNA BHANDAR · {role}</span>
            <h1>{title}</h1>
          </div>
          <span className="admin-mode">
            {isDemo ? "Demo workspace" : "Live store"}
          </span>
        </header>
        {isDemo && (
          <div className="notice">
            Admin preview: changes stay in memory in this tab. Authentication
            and all live changes use the Cloudflare BFF.
          </div>
        )}
        {saved && (
          <p role="status" className="admin-success">
            <Check size={16} />
            {saved}
          </p>
        )}
        {resource === "overview" ? (
          <>
            <div className="admin-welcome">
              <LayoutDashboard size={32} />
              <h2>Your store, thoughtfully managed.</h2>
              <p>
                Manage products, fulfil orders, schedule campaigns and shape
                your storefront from one place.
              </p>
            </div>
            <div className="admin-status-grid">
              {[
                ["supabase", "Database connection"],
                ["payments", "Payment provider"],
                ["webhook", "Webhook verification"],
                ["turnstile", "Checkout protection"],
                [
                  "infrastructureCheckoutEnabled",
                  "Infrastructure checkout gate",
                ],
              ].map(([key, label]) => (
                <article key={key}>
                  <ShieldCheck size={20} />
                  <strong>{label}</strong>
                  <span>
                    {status.data?.[key] ? "Configured" : "Not configured"}
                  </span>
                </article>
              ))}
            </div>
            <div className="notice">
              Launch controls are under Storefront & settings. Infrastructure
              secrets are configured in Cloudflare, never exposed here. Manage
              available stock separately from reserved stock. Use Activity log
              to review changes.
            </div>
          </>
        ) : (
          <>
            <div className="admin-toolbar">
              <label>
                <Search size={17} />
                <input
                  aria-label="Search current admin page"
                  placeholder="Search this page…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              {!readonly && !["settings", "reviews"].includes(resource) && (
                <button
                  className="button"
                  onClick={() => {
                    setValidation("");
                    setEditing(freshRecord(resource));
                  }}
                >
                  <Plus size={16} /> Add {title.split(" ")[0].toLowerCase()}
                </button>
              )}
            </div>
            {query.isPending ? (
              <p role="status">Loading {title.toLowerCase()}…</p>
            ) : query.isError ? (
              <ErrorState retry={() => query.refetch()} />
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Name / reference</th>
                      <th>Status / details</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => {
                      const data = row.data as AdminRecord | undefined;
                      const name = String(
                        data?.name ||
                          row.name ||
                          row.title ||
                          row.key ||
                          row.code ||
                          row.slug ||
                          row.id ||
                          row.user_id ||
                          index,
                      );
                      return (
                        <tr
                          key={String(
                            row.id || row.key || row.code || row.slug || index,
                          )}
                        >
                          <td>
                            <strong>{name}</strong>
                            {resource === "products" && (
                              <small>{String(data?.category || "")}</small>
                            )}
                            {resource === "reviews" && (
                              <p>
                                {String(row.rating)} / 5 · {String(row.name)}
                                <br />
                                {String(row.body)}
                              </p>
                            )}
                            {resource === "orders" && (
                              <small>
                                {String(
                                  (row.contact as AdminRecord)?.name || "",
                                )}{" "}
                                · {money(Number(row.total))}
                              </small>
                            )}
                          </td>
                          <td>
                            {String(
                              row.status ??
                                row.role ??
                                row.action ??
                                (row.active !== undefined
                                  ? row.active
                                    ? "Active"
                                    : "Inactive"
                                  : row.published !== undefined
                                    ? row.published
                                      ? "Published"
                                      : "Draft"
                                    : "Configuration"),
                            )}
                          </td>
                          <td>
                            {resource === "orders" ? (
                              <OrderActions row={row} />
                            ) : resource === "refund_jobs" ? (
                              <RefundActions row={row} />
                            ) : resource === "admin_audit" ? (
                              <time>{String(row.created_at)}</time>
                            ) : (
                              <button
                                className="text-button"
                                onClick={() => {
                                  setValidation("");
                                  mutation.reset();
                                  setEditing(normalized(resource, row));
                                }}
                              >
                                Edit
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!rows.length && (
                  <div className="empty">
                    <h2>Nothing here yet.</h2>
                    <p>
                      {isDemo
                        ? "This preview has no records for this section."
                        : "Add your first record or try a different search."}
                    </p>
                  </div>
                )}
              </div>
            )}
            {query.data && query.data.total > 50 && (
              <nav className="pagination" aria-label="Admin pages">
                <button
                  disabled={page === 1}
                  onClick={() =>
                    setParams({ section: resource, page: String(page - 1) })
                  }
                >
                  Previous
                </button>
                <span>Page {page}</span>
                <button
                  disabled={page * 50 >= query.data.total}
                  onClick={() =>
                    setParams({ section: resource, page: String(page + 1) })
                  }
                >
                  Next
                </button>
              </nav>
            )}
          </>
        )}
        {editing && (
          <Dialog
            title={`Edit ${resource === "settings" ? String(editing.key) : title.toLowerCase()}`}
            onClose={() => {
              if (!mutation.isPending) setEditing(null);
            }}
          >
            <form
              className="admin-editor"
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              {resource === "settings" ? (
                <Editor
                  value={editing.value}
                  path={String(editing.key)}
                  onChange={(value) => setEditing({ ...editing, value })}
                />
              ) : (
                <Editor
                  value={editing}
                  onChange={(v) => setEditing(v as AdminRecord)}
                />
              )}
              <p className="muted">
                Saving publishes these values immediately. Inactive products and
                campaigns stay hidden.
              </p>
              {(validation || mutation.isError) && (
                <p
                  className="field-error"
                  role="alert"
                  style={{ whiteSpace: "pre-wrap" }}
                >
                  {validation || mutation.error?.message}
                </p>
              )}
              <button className="button full" disabled={mutation.isPending}>
                {mutation.isPending ? "Saving…" : "Save changes"}
              </button>
            </form>
          </Dialog>
        )}
      </main>
    </div>
  );
}
function OrderActions({ row }: { row: AdminRecord }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [next, setNext] = useState(""),
    [tracking, setTracking] = useState(""),
    [carrier, setCarrier] = useState("");
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: () =>
      api("/api/admin/orders", {
        method: "PATCH",
        body: JSON.stringify({
          id: row.id,
          status: next,
          tracking: { carrier, reference: tracking, url: "" },
        }),
      }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["admin", "orders"] }),
  });
  const choices: Record<string, string[]> = {
    pending_payment: ["cancelled"],
    paid: ["preparing", "cancelled"],
    preparing: ["shipped", "ready_for_pickup"],
    shipped: ["completed"],
    ready_for_pickup: ["completed"],
  };
  return (
    <div>
      <button className="text-button" onClick={() => setDetailsOpen(true)}>
        View #{String(row.id).slice(0, 8)}
      </button>
      {cancelOpen && (
        <Dialog title="Cancel this order?" onClose={() => setCancelOpen(false)}>
          <p>
            Reserved stock will be released. If payment was captured, a full
            refund will be queued.
          </p>
          <button
            className="button"
            disabled={mutation.isPending}
            onClick={() =>
              mutation.mutate(undefined, {
                onSuccess: () => setCancelOpen(false),
              })
            }
          >
            Confirm cancellation
          </button>
          {mutation.isError && <p role="alert">{mutation.error.message}</p>}
        </Dialog>
      )}
      {detailsOpen && (
        <OrderDetails
          id={String(row.id)}
          onClose={() => setDetailsOpen(false)}
        />
      )}
      {choices[String(row.status)] && (
        <>
          <select
            aria-label="Next order status"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          >
            <option value="">Change status…</option>
            {choices[String(row.status)].map((s) => (
              <option key={s} value={s}>
                {s.replaceAll("_", " ")}
              </option>
            ))}
          </select>
          {next === "shipped" && (
            <>
              <input
                aria-label="Carrier"
                placeholder="Carrier"
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
              />
              <input
                aria-label="Tracking reference"
                placeholder="Tracking reference"
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
              />
            </>
          )}
          <button
            className="text-button"
            disabled={!next || mutation.isPending || isDemo}
            onClick={() =>
              next === "cancelled" ? setCancelOpen(true) : mutation.mutate()
            }
          >
            Update order
          </button>
        </>
      )}
      {mutation.isError && <p role="alert">{mutation.error.message}</p>}
    </div>
  );
}
function RefundActions({ row }: { row: AdminRecord }) {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: () =>
      api("/api/admin/refunds", {
        method: "POST",
        body: JSON.stringify({ id: row.id }),
      }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["admin", "refund_jobs"] }),
  });
  return (
    <div>
      <small>
        {String(
          row.last_error || "Automatic reconciliation runs every five minutes.",
        )}
      </small>
      <button
        className="text-button"
        disabled={isDemo || mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        Reconcile provider status
      </button>
      {mutation.isError && <p role="alert">{mutation.error.message}</p>}
    </div>
  );
}

function OrderDetails({ id, onClose }: { id: string; onClose: () => void }) {
  const query = useQuery({
    queryKey: ["admin", "orders", id],
    queryFn: () =>
      api<{
        id: string;
        total: number;
        status: string;
        contact: Record<string, string>;
        order_items: {
          snapshot: {
            name: string;
            label: string;
            gift?: Record<string, string>;
          };
          quantity: number;
          unit_price: number;
        }[];
        order_events: {
          status: string;
          description: string;
          created_at: string;
        }[];
      }>(`/api/admin/orders/${id}`),
  });
  return (
    <Dialog title={`Order #${id.slice(0, 8)}`} onClose={onClose}>
      {query.isPending ? (
        <p role="status">Loading order…</p>
      ) : query.isError ? (
        <ErrorState retry={() => query.refetch()} />
      ) : (
        <div className="admin-editor">
          <p>
            <strong>{query.data.status.replaceAll("_", " ")}</strong> ·{" "}
            {money(query.data.total)}
          </p>
          <h3>Customer & fulfilment</h3>
          <dl>
            {Object.entries(query.data.contact)
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k}>
                  <dt>{label(k)}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
          </dl>
          <h3>Items</h3>
          {query.data.order_items.map((item, i) => (
            <article key={i}>
              <strong>{item.snapshot.name}</strong>
              <p>
                {item.snapshot.label} · {item.quantity} ×{" "}
                {money(item.unit_price)}
              </p>
              {item.snapshot.gift && (
                <dl>
                  {Object.entries(item.snapshot.gift)
                    .filter(([, v]) => v)
                    .map(([k, v]) => (
                      <div key={k}>
                        <dt>{label(k)}</dt>
                        <dd>{String(v)}</dd>
                      </div>
                    ))}
                </dl>
              )}
            </article>
          ))}
          <h3>Order history</h3>
          {query.data.order_events.map((event, i) => (
            <p key={i}>
              {event.description}
              <br />
              <small>
                {new Date(event.created_at).toLocaleString("en-IN")}
              </small>
            </p>
          ))}
        </div>
      )}
    </Dialog>
  );
}
