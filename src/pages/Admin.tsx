import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  ArrowLeft,
  Plus,
  Check,
  Search,
  ShieldCheck,
  Menu,
} from "lucide-react";
import { useSession } from "../lib/auth";
import { isDemo } from "../lib/api";
import { api, ApiError } from "../lib/request";
import {
  adminApi,
  adminResources,
  freshRecord,
  type Json,
  type AdminRecord,
} from "../lib/admin";
import { SignIn } from "../components/SignIn";
import { Dialog, ErrorState } from "../components/ui";
import { AdminEditor } from "../components/admin/AdminEditor";
import { money } from "../lib/config";
import { label } from "../components/admin/fields";
function normalized(resource: string, row: AdminRecord): AdminRecord {
  if (resource === "customers")
    return {
      user_id: row.user_id,
      name: row.name,
      phone: row.phone,
      staff_notes: row.staff_notes,
      revision: row.revision,
    };
  if (resource === "products") {
    const data = row.data as AdminRecord;
    const variants = (row.product_variants || row.variants) as AdminRecord[];
    const inv = Array.isArray(row.inventory) ? row.inventory[0] : row.inventory;
    return {
      id: row.id,
      revision: row.revision || 0,
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
        storageInstructions: data.storageInstructions || "",
        freshnessDetails: data.freshnessDetails || "",
        crossContactWarning: data.crossContactWarning || "",
        shelfLife: data.shelfLife,
        shelfLifeDays: data.shelfLifeDays,
        requiresRefrigeration: data.requiresRefrigeration,
        featured: data.featured,
        createdAt: data.createdAt,
      },
      variants: variants
        .filter((v) => v.active !== false)
        .map(({ id, label, price, stock, sort_order, revision }) => ({
          id,
          revision: revision || 0,
          label,
          price,
          stock,
          sort_order,
        })),
      inventory: {
        revision: (inv as AdminRecord).revision || 0,
        piece_price: (inv as AdminRecord).piece_price,
        pieces: (inv as AdminRecord).pieces,
      },
    };
  }
  if (resource === "reviews")
    return {
      id: row.id,
      published: row.published,
      __context: `${row.product_name || row.product_id} · ${row.name} · ${row.rating}/5 · ${row.verified ? "Verified purchase" : "Unverified review"} — ${row.body}`,
    };
  if (resource === "admin_users")
    return { user_id: row.user_id, role: row.role };
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
  if (!isDemo && session.isError)
    return (
      <div className="section">
        <h1>Could not verify your session</h1>
        <ErrorState retry={() => session.refetch()} />
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
  return (
    <AdminWorkspace
      role={isDemo ? "owner" : session.data!.role!}
      email={session.data?.user?.email || "Preview owner"}
    />
  );
}
function AdminWorkspace({
  role,
  email,
}: {
  role: "owner" | "manager";
  email: string;
}) {
  const [params, setParams] = useSearchParams();
  const requested = params.get("section") || "overview";
  const forbidden =
    role !== "owner" &&
    ["settings", "admin_users", "admin_audit"].includes(requested);
  const resource = adminResources.some(([key]) => key === requested)
    ? requested
    : "overview";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [editing, setEditing] = useState<AdminRecord | null>(null),
    [search, setSearch] = useState(params.get("q") || ""),
    [saved, setSaved] = useState("");
  const [navigationOpen, setNavigationOpen] = useState(false);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 901px)");
    const closeOnDesktop = () => {
      if (desktop.matches) setNavigationOpen(false);
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);
  useEffect(() => setNavigationOpen(false), [params]);
  const client = useQueryClient();
  const logout = useMutation({
    mutationFn: () => api("/api/auth/logout", { method: "POST" }),
    onSuccess: () => {
      client.removeQueries({ queryKey: ["admin"] });
      client.removeQueries({ queryKey: ["account"] });
      client.removeQueries({ queryKey: ["orders"] });
      client.setQueryData(["session"], { user: null, role: null });
    },
  });
  const filters = Object.fromEntries(
    ["q", "status", "method", "from", "to", "sort"].map((k) => [
      k,
      params.get(k) || "",
    ]),
  );
  const changeFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    next.delete("page");
    setParams(next);
  };

  const query = useQuery({
    queryKey: ["admin", resource, page, filters],
    queryFn: ({ signal }) => adminApi.list(resource, page, filters, signal),
    enabled: resource !== "overview" && !forbidden,
  });
  const status = useQuery({
    queryKey: ["admin", "status"],
    enabled: resource === "overview",
    staleTime: 30000,
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
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409)
        void client.invalidateQueries({ queryKey: ["admin"] });
    },
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
    setSaved("");
    setSearch(params.get("q") || "");
  }, [resource, params.get("q")]);
  const title =
    adminResources.find(([key]) => key === resource)?.[1] || "Management";
  const rows = query.data?.items || [];
  const readonly = ["orders", "refund_jobs", "admin_audit"].includes(resource);
  const sectionNavigation = (
    <nav className="admin-section-links" aria-label="Admin sections">
      {adminResources
        .filter(
          ([key]) =>
            role === "owner" ||
            !["settings", "admin_users", "admin_audit"].includes(key),
        )
        .map(([key, label]) => (
          <button
            aria-current={resource === key ? "page" : undefined}
            className={resource === key ? "active" : ""}
            key={key}
            onClick={() => {
              setNavigationOpen(false);
              setParams({ section: key });
            }}
          >
            {label}
          </button>
        ))}
    </nav>
  );
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link to="/" className="admin-brand">
          Bapi <span>Store studio</span>
        </Link>
        {sectionNavigation}
        <Link className="admin-back" to="/">
          <ArrowLeft size={15} /> Back to storefront
        </Link>
      </aside>
      <div className="admin-mobile-header">
        <Link to="/" className="admin-brand">
          Bapi <span>Store studio</span>
        </Link>
        <button
          type="button"
          className="admin-navigation-toggle"
          aria-label="Open admin sections"
          aria-expanded={navigationOpen}
          aria-haspopup="dialog"
          onClick={() => setNavigationOpen(true)}
        >
          <Menu size={22} aria-hidden="true" /> Sections
        </button>
      </div>
      {navigationOpen && (
        <Dialog
          title="Admin sections"
          drawer
          className="admin-navigation-drawer"
          onClose={() => setNavigationOpen(false)}
        >
          {sectionNavigation}
          <Link
            className="admin-back"
            to="/"
            onClick={() => setNavigationOpen(false)}
          >
            <ArrowLeft size={18} aria-hidden="true" /> Back to storefront
          </Link>
        </Dialog>
      )}
      <main className="admin-main">
        <div className="admin-operator">
          <span>
            {email} · {role}
          </span>
          {!isDemo && (
            <button disabled={logout.isPending} onClick={() => logout.mutate()}>
              Sign out
            </button>
          )}
          {logout.isError && <p role="alert">{logout.error.message}</p>}
        </div>
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
        {forbidden ? (
          <div className="notice" role="alert">
            This section requires an owner account.{" "}
            <button onClick={() => setParams({ section: "overview" })}>
              Go to overview
            </button>
          </div>
        ) : resource === "overview" ? (
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
                ["imageProcessing", "Responsive image processing"],
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
                    {status.isPending
                      ? "Checking…"
                      : status.isError
                        ? "Unable to check"
                        : status.data?.[key]
                          ? "Configured"
                          : "Not configured"}
                  </span>
                </article>
              ))}
            </div>
            {status.isError && <ErrorState retry={() => status.refetch()} />}
            <OperationalHealth />
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
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  changeFilter("q", search);
                }}
              >
                <label>
                  <Search size={17} />
                  <input
                    aria-label="Search all records"
                    placeholder="Search all records…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <button type="submit">Search</button>
              </form>
              <label>
                Sort
                <select
                  value={filters.sort}
                  onChange={(e) => changeFilter("sort", e.target.value)}
                >
                  <option value="">Default</option>
                  {[
                    "products",
                    "orders",
                    "customers",
                    "reviews",
                    "refund_jobs",
                    "admin_audit",
                  ].includes(resource) && (
                    <>
                      <option value="newest">Newest first</option>
                      <option value="oldest">Oldest first</option>
                    </>
                  )}
                  <option value="name">Name</option>
                </select>
              </label>
              {[
                "orders",
                "refund_jobs",
                "reviews",
                "products",
                "admin_users",
              ].includes(resource) && (
                <label>
                  Status
                  <select
                    value={filters.status}
                    onChange={(e) => changeFilter("status", e.target.value)}
                  >
                    <option value="">All statuses</option>
                    {(resource === "orders"
                      ? [
                          "pending_payment",
                          "paid",
                          "preparing",
                          "shipped",
                          "ready_for_pickup",
                          "completed",
                          "cancelled",
                          "expired",
                          "refund_pending",
                          "refunded",
                        ]
                      : resource === "refund_jobs"
                        ? [
                            "queued",
                            "processing",
                            "submitted",
                            "processed",
                            "failed",
                          ]
                        : resource === "admin_users"
                          ? ["owner", "manager"]
                          : ["true", "false"]
                    ).map((v) => (
                      <option key={v} value={v}>
                        {v === "true"
                          ? "Active / published"
                          : v === "false"
                            ? "Inactive / draft"
                            : v.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {resource === "orders" && (
                <>
                  <label>
                    Fulfilment
                    <select
                      value={filters.method}
                      onChange={(e) => changeFilter("method", e.target.value)}
                    >
                      <option value="">All methods</option>
                      <option value="pickup">Store pickup</option>
                      <option value="delivery">Delivery</option>
                    </select>
                  </label>
                  <label>
                    From
                    <input
                      type="date"
                      value={filters.from}
                      onChange={(e) => changeFilter("from", e.target.value)}
                    />
                  </label>
                  <label>
                    Through
                    <input
                      type="date"
                      value={filters.to}
                      onChange={(e) => changeFilter("to", e.target.value)}
                    />
                  </label>
                </>
              )}
              {!readonly &&
                !["settings", "reviews", "customers"].includes(resource) && (
                  <button
                    className="button"
                    onClick={() => {
                      setEditing(freshRecord(resource));
                    }}
                  >
                    <Plus size={16} /> Add {title.split(" ")[0].toLowerCase()}
                  </button>
                )}
            </div>
            {query.data && (
              <p className="muted">
                {query.data.total} records · Page {page}
                {Object.values(filters).some(Boolean) && (
                  <button
                    className="text-button"
                    onClick={() => setParams({ section: resource })}
                  >
                    Clear filters
                  </button>
                )}
              </p>
            )}
            {query.isPending ? (
              <p role="status">Loading {title.toLowerCase()}…</p>
            ) : query.isError ? (
              <>
                {query.error instanceof ApiError &&
                [401, 403].includes(query.error.status) ? (
                  <p role="alert">
                    Your account no longer has permission to access this
                    section. <Link to="/account">Manage your account</Link>
                  </p>
                ) : (
                  <ErrorState retry={() => query.refetch()} />
                )}
              </>
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
                          <td data-label="Name / reference">
                            <strong>
                              {["orders", "refund_jobs"].includes(resource)
                                ? `#${String(row.id).slice(0, 8)}`
                                : resource === "admin_users"
                                  ? String(
                                      (row.person as AdminRecord)?.name ||
                                        (row.person as AdminRecord)?.email ||
                                        name,
                                    )
                                  : resource === "admin_audit"
                                    ? String(row.action)
                                    : name}
                            </strong>
                            {row.id && (
                              <details className="admin-reference">
                                <summary>Full reference</summary>
                                <code>{String(row.id)}</code>
                              </details>
                            )}
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
                          <td data-label="Status / details">
                            <RecordContext resource={resource} row={row} />
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
                          <td data-label="Actions">
                            {resource === "admin_users" && (
                              <RevokeAccess row={row} />
                            )}
                            {resource === "customers" && (
                              <CustomerHistory
                                id={String(row.user_id)}
                                name={String(
                                  row.name || row.phone || "Customer",
                                )}
                              />
                            )}
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
                                  mutation.reset();
                                  setEditing({
                                    ...normalized(resource, row),
                                    __existing: true,
                                  });
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
                    <h2>
                      {Object.values(filters).some(Boolean)
                        ? "No matching records."
                        : "Nothing here yet."}
                    </h2>
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
                    setParams({
                      ...Object.fromEntries(params),
                      page: String(page - 1),
                    })
                  }
                >
                  Previous
                </button>
                <span>Page {page}</span>
                <button
                  disabled={page * 50 >= query.data.total}
                  onClick={() =>
                    setParams({
                      ...Object.fromEntries(params),
                      page: String(page + 1),
                    })
                  }
                >
                  Next
                </button>
              </nav>
            )}
          </>
        )}
        {editing && (
          <AdminEditor
            record={editing}
            resource={resource}
            title={
              resource === "settings"
                ? String(editing.key)
                : title.toLowerCase()
            }
            pending={mutation.isPending}
            error={mutation.error?.message}
            onSave={(r) => mutation.mutate(r)}
            onClose={() => setEditing(null)}
          />
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
    [carrier, setCarrier] = useState(""),
    [trackingUrl, setTrackingUrl] = useState("");
  useEffect(() => {
    setNext("");
    setTracking("");
    setCarrier("");
    setTrackingUrl("");
  }, [row.id, row.status]);
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: () =>
      api("/api/admin/orders", {
        method: "PATCH",
        body: JSON.stringify({
          id: row.id,
          status: next,
          tracking: { carrier, reference: tracking, url: trackingUrl },
        }),
      }),
    onSuccess: async () => {
      setNext("");
      setTracking("");
      setCarrier("");
      await client.invalidateQueries({ queryKey: ["admin", "orders"] });
    },
  });
  const choices: Record<string, string[]> = {
    pending_payment: ["cancelled"],
    paid: ["preparing", "cancelled"],
    preparing:
      (row.contact as AdminRecord)?.method === "pickup"
        ? ["ready_for_pickup"]
        : ["shipped"],
    shipped: ["completed"],
    ready_for_pickup: ["completed"],
  };
  return (
    <div>
      <button className="text-button" onClick={() => setDetailsOpen(true)}>
        View #{String(row.id).slice(0, 8)}
      </button>
      {cancelOpen && (
        <Dialog
          title="Cancel this order?"
          onClose={() => {
            if (!mutation.isPending) setCancelOpen(false);
          }}
        >
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
            disabled={mutation.isPending}
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
                disabled={mutation.isPending}
                aria-label="Carrier"
                placeholder="Carrier"
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
              />
              <input
                disabled={mutation.isPending}
                aria-label="Tracking reference"
                placeholder="Tracking reference"
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
              />
              <input
                aria-label="Tracking URL (optional, HTTPS)"
                type="url"
                placeholder="https://…"
                value={trackingUrl}
                disabled={mutation.isPending}
                onChange={(e) => setTrackingUrl(e.target.value)}
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
      {mutation.isSuccess && <p role="status">Order updated.</p>}
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
        tracking?: { carrier?: string; reference?: string; url?: string };
        contact: Record<string, string>;
        order_items: {
          snapshot: {
            name: string;
            label: string;
            gift?: Record<string, string>;
            boxItems?: { name: string; quantity: number }[];
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
          {query.data.tracking && (
            <section>
              <h3>Tracking</h3>
              <p>
                {query.data.tracking.carrier} · {query.data.tracking.reference}
              </p>
              {query.data.tracking.url?.startsWith("https://") && (
                <a
                  href={query.data.tracking.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Track shipment
                </a>
              )}
            </section>
          )}
          <h3>Items</h3>
          {query.data.order_items.map((item, i) => (
            <article key={i}>
              <strong>{item.snapshot.name}</strong>
              <p>
                {item.snapshot.label} · {item.quantity} ×{" "}
                {money(item.unit_price)}
              </p>
              {!!item.snapshot.boxItems?.length && (
                <div>
                  <strong>Pack each box with</strong>
                  <ul>
                    {item.snapshot.boxItems.map((piece, index) => (
                      <li key={index}>
                        {piece.name} · {piece.quantity} pieces per box ·{" "}
                        {piece.quantity * item.quantity} pieces total
                      </li>
                    ))}
                  </ul>
                </div>
              )}
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
function CustomerHistory({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["admin", "customers", id, page],
    enabled: open,
    queryFn: () =>
      api<{
        addresses: {
          id: string;
          label: string;
          data: Record<string, string>;
        }[];
        orders: {
          id: string;
          total: number;
          status: string;
          created_at: string;
        }[];
        ordersTotal: number;
      }>(`/api/admin/customers/${id}?page=${page}`),
  });
  return (
    <>
      <button className="text-button" onClick={() => setOpen(true)}>
        Addresses & orders
      </button>
      {open && (
        <Dialog
          title={`${name} · customer history`}
          onClose={() => setOpen(false)}
        >
          {query.isPending ? (
            <p>Loading…</p>
          ) : query.isError ? (
            <ErrorState retry={() => query.refetch()} />
          ) : (
            <div className="admin-editor">
              <h3>Addresses</h3>
              {!query.data.addresses.length && <p>No saved addresses.</p>}
              {query.data.addresses.map((a) => (
                <p key={a.id}>
                  <strong>{a.label}</strong>
                  <br />
                  {a.data.address} · {a.data.pincode}
                </p>
              ))}
              <h3>Orders</h3>
              {!query.data.orders.length &&
                (query.data.ordersTotal === 0 ? (
                  <p>No orders yet.</p>
                ) : (
                  <div>
                    <p>No orders on this page.</p>
                    <button type="button" onClick={() => setPage(1)}>
                      Return to first page
                    </button>
                  </div>
                ))}
              {query.data.orders.map((o) => (
                <p key={o.id}>
                  <OrderLink id={o.id} /> · {money(o.total)} · {o.status} ·{" "}
                  {new Date(o.created_at).toLocaleDateString("en-IN")}
                </p>
              ))}
              {query.data.ordersTotal > 50 && (
                <nav className="pagination" aria-label="Customer order pages">
                  <button
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous orders
                  </button>
                  <span>Page {page}</span>
                  <button
                    disabled={page * 50 >= query.data.ordersTotal}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next orders
                  </button>
                </nav>
              )}
            </div>
          )}
        </Dialog>
      )}
    </>
  );
}

function OperationalHealth() {
  const query = useQuery({
    queryKey: ["admin", "status"],
    staleTime: 30000,
    enabled: !isDemo,
    refetchInterval: 60000,
    queryFn: () =>
      api<{
        operationalHealth: {
          maintenance: { status: string; last_success_at: string } | null;
          overdueReservations: number;
          refundsNeedingReview: number;
          agedRefunds: number;
        };
      }>("/api/admin/status"),
  });
  if (isDemo)
    return (
      <p className="muted">
        Operational health is available when the live backend is connected.
      </p>
    );
  if (query.isError)
    return <p role="alert">Operational health could not be loaded.</p>;
  const h = query.data?.operationalHealth;
  if (!h) return <p role="status">Checking scheduled operations…</p>;
  const stale =
    !h.maintenance?.last_success_at ||
    Date.parse(h.maintenance.last_success_at) < Date.now() - 900000;
  return (
    <section className="notice">
      <div>
        <h3>Scheduled operations</h3>
        {h.maintenance?.status === "failed" && (
          <p role="alert">
            The latest maintenance run failed. Check worker logs and retry the
            job.
          </p>
        )}
        {stale && <p>Maintenance is overdue or has not run yet.</p>}
        {h.maintenance?.last_success_at && (
          <p>
            Last successful run:{" "}
            {new Date(h.maintenance.last_success_at).toLocaleString("en-IN", {
              timeZone: "Asia/Kolkata",
            })}{" "}
            IST
          </p>
        )}
        <p>
          Overdue reservations: {h.overdueReservations} · Refunds needing
          review: {h.refundsNeedingReview} · Refunds over one hour old:{" "}
          {h.agedRefunds}
        </p>
      </div>
    </section>
  );
}

function RecordContext({
  resource,
  row,
}: {
  resource: string;
  row: AdminRecord;
}) {
  const person = row.person as AdminRecord | undefined;
  const contact = row.contact as AdminRecord | undefined;
  const variants = (row.product_variants ||
    row.variants ||
    []) as AdminRecord[];
  const inventory = (
    Array.isArray(row.inventory) ? row.inventory[0] : row.inventory
  ) as AdminRecord | undefined;
  return (
    <div className="admin-record-context">
      {resource === "products" &&
        variants
          .filter((v) => v.active !== false)
          .map((v) => (
            <small key={String(v.id)}>
              {String(v.label)} · {money(Number(v.price))} · {String(v.stock)}{" "}
              available
            </small>
          ))}
      {resource === "products" && inventory && (
        <small>
          {String(inventory.pieces)} individual pieces ·{" "}
          {money(Number(inventory.piece_price))} each
          {Number(inventory.pieces) <= 5 ? " · Low piece stock" : ""}
        </small>
      )}
      {resource === "products" &&
        variants.some((v) => v.active !== false && Number(v.stock) <= 5) && (
          <strong>Low pack stock — check availability</strong>
        )}
      {resource === "orders" && (
        <>
          <small>
            {String(contact?.method || "")} · {String(contact?.date || "")}
          </small>
          <small>
            {new Date(String(row.created_at)).toLocaleString("en-IN")}
          </small>
        </>
      )}
      {resource === "customers" && (
        <small>{String(row.phone || "No phone on file")}</small>
      )}
      {resource === "reviews" && (
        <small>
          {String(row.product_name || row.product_id)} ·{" "}
          {row.verified ? "Verified purchase" : "Unverified review"}
          {row.order_id && <OrderLink id={String(row.order_id)} />}
        </small>
      )}
      {resource === "refund_jobs" && (
        <>
          <small>
            {String(row.customer_name || "")} · Order #
            {String(row.order_id).slice(0, 8)} ·{" "}
            {money(Number(row.amount) / 100)}
          </small>
          <OrderLink id={String(row.order_id)} />
        </>
      )}
      {person && (
        <small>
          {String(person.name || "")} ·{" "}
          {String(person.email || person.phone || row.user_id)}
        </small>
      )}
      {resource === "admin_audit" && (
        <small>Target: {String(row.resource)}</small>
      )}
    </div>
  );
}
function OrderLink({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="text-button" onClick={() => setOpen(true)}>
        View order #{id.slice(0, 8)}
      </button>
      {open && <OrderDetails id={id} onClose={() => setOpen(false)} />}
    </>
  );
}
function RevokeAccess({ row }: { row: AdminRecord }) {
  const [open, setOpen] = useState(false);
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: () =>
      api("/api/admin/admin_users", {
        method: "DELETE",
        body: JSON.stringify({ user_id: row.user_id }),
      }),
    onSuccess: async () => {
      setOpen(false);
      await client.invalidateQueries({ queryKey: ["admin"] });
      await client.invalidateQueries({ queryKey: ["session"] });
    },
  });
  return (
    <>
      <button
        className="text-button"
        disabled={isDemo}
        onClick={() => setOpen(true)}
      >
        Revoke access
      </button>
      {open && (
        <Dialog
          title="Revoke staff access?"
          onClose={() => {
            if (!mutation.isPending) setOpen(false);
          }}
        >
          <p>
            This account will lose administrator access immediately. Their
            customer account remains available.
          </p>
          <button
            className="button"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Confirm revocation
          </button>
          {mutation.isError && <p role="alert">{mutation.error.message}</p>}
        </Dialog>
      )}
    </>
  );
}
