import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "../lib/auth";
import { api } from "../lib/request";
import { money } from "../lib/config";
import { SignIn } from "../components/SignIn";
import { Dialog, ErrorState } from "../components/ui";
import type { Address, Order } from "../lib/types";
export default function Account() {
  const session = useSession(),
    client = useQueryClient();
  const [editing, setEditing] = useState<Partial<Address> | null>(null);
  const query = useQuery({
    queryKey: ["account", session.data?.user?.id],
    queryFn: ({ signal }) =>
      api<{
        profile: { name: string; phone: string };
        addresses: Address[];
        orders: (Order & { created_at: string })[];
      }>("/api/account", { signal }),
    enabled: !!session.data?.user,
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: ({
      path,
      method,
      data,
    }: {
      path: string;
      method: string;
      data?: unknown;
    }) =>
      api(path, { method, ...(data ? { body: JSON.stringify(data) } : {}) }),
    onSuccess: async () => {
      setEditing(null);
      await client.invalidateQueries({ queryKey: ["account"] });
    },
  });
  const logout = useMutation({
    mutationFn: () => api("/api/auth/logout", { method: "POST" }),
    onSuccess: () => {
      client.removeQueries({ queryKey: ["account"] });
      client.removeQueries({ queryKey: ["admin"] });
      client.removeQueries({ queryKey: ["orders"] });
      client.setQueryData(["session"], { user: null, role: null });
    },
  });
  if (session.isPending)
    return (
      <div className="section" role="status">
        Checking your session…
      </div>
    );
  return (
    <div className="section account-page">
      <div className="page-intro">
        <span className="eyebrow">YOUR LITTLE CORNER</span>
        <h1>A sweeter welcome.</h1>
      </div>
      {!session.data?.user ? (
        <div className="auth-card">
          <SignIn />
        </div>
      ) : (
        <>
          <div className="account-actions">
            <span>{session.data.user.email}</span>
            {session.data.role && (
              <Link className="button" to="/admin">
                Store administration
              </Link>
            )}
            <button
              className="text-button"
              disabled={logout.isPending}
              onClick={() => logout.mutate()}
            >
              Sign out
            </button>
          </div>
          {query.isError ? (
            <ErrorState retry={() => query.refetch()} />
          ) : !query.data ? (
            <p role="status">Loading your account…</p>
          ) : (
            <div className="account-grid">
              <section>
                <h2>Your details.</h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const data = Object.fromEntries(
                      new FormData(e.currentTarget),
                    );
                    mutation.mutate({
                      path: "/api/account",
                      method: "PATCH",
                      data,
                    });
                  }}
                >
                  <label>
                    Full name
                    <input
                      name="name"
                      required
                      minLength={2}
                      maxLength={100}
                      defaultValue={query.data.profile.name}
                    />
                  </label>
                  <label>
                    Mobile number
                    <input
                      name="phone"
                      pattern="[6-9][0-9]{9}"
                      inputMode="tel"
                      required
                      defaultValue={query.data.profile.phone}
                    />
                  </label>
                  <button className="button" disabled={mutation.isPending}>
                    Save profile
                  </button>
                </form>
                <div className="section-heading">
                  <h2>Saved addresses.</h2>
                  <button
                    className="text-button"
                    onClick={() =>
                      setEditing({
                        label: "Home",
                        name: "",
                        phone: "",
                        address: "",
                        pincode: "",
                      })
                    }
                  >
                    Add address
                  </button>
                </div>
                {query.data.addresses.map((a) => (
                  <article className="address-card" key={a.id}>
                    <strong>
                      {a.label} · {a.name}
                    </strong>
                    <p>
                      {a.address}
                      <br />
                      {a.pincode} · {a.phone}
                    </p>
                    <button
                      className="text-button"
                      onClick={() => setEditing(a)}
                    >
                      Edit
                    </button>
                    <button
                      className="text-button"
                      disabled={mutation.isPending}
                      onClick={() =>
                        mutation.mutate({
                          path: "/api/account/addresses",
                          method: "DELETE",
                          data: { id: a.id },
                        })
                      }
                    >
                      Remove
                    </button>
                  </article>
                ))}
                {!query.data.addresses.length && <p>No saved addresses yet.</p>}
              </section>
              <section>
                <h2>Your orders.</h2>
                {query.data.orders.length ? (
                  query.data.orders.map((order) => (
                    <Link
                      className="account-order"
                      key={order.id}
                      to={`/orders/${order.id}`}
                    >
                      <div>
                        <strong>
                          Order {order.id.slice(0, 8).toUpperCase()}
                        </strong>
                        <small>
                          {new Date(order.created_at).toLocaleDateString(
                            "en-IN",
                          )}{" "}
                          · {order.status.replaceAll("_", " ")}
                        </small>
                      </div>
                      <span>{money(order.total)} →</span>
                    </Link>
                  ))
                ) : (
                  <p>Your first sweet order is waiting to happen.</p>
                )}
                <Link className="button button-outline" to="/shop">
                  Find your favourites
                </Link>
              </section>
            </div>
          )}
          {(mutation.isError || logout.isError) && (
            <p role="alert" className="field-error">
              {mutation.error?.message || logout.error?.message}
            </p>
          )}
        </>
      )}
      {editing && (
        <Dialog
          title={editing.id ? "Edit address" : "A new address"}
          onClose={() => setEditing(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate({
                path: "/api/account/addresses",
                method: "POST",
                data: editing,
              });
            }}
          >
            {(["label", "name", "phone", "address", "pincode"] as const).map(
              (k) => (
                <label key={k}>
                  {k === "name"
                    ? "Recipient name"
                    : k.charAt(0).toUpperCase() + k.slice(1)}
                  <input
                    value={editing[k] || ""}
                    required
                    maxLength={k === "address" ? 500 : 100}
                    onChange={(e) =>
                      setEditing({ ...editing, [k]: e.target.value })
                    }
                  />
                </label>
              ),
            )}
            <button className="button" disabled={mutation.isPending}>
              Save address
            </button>
            {mutation.isError && (
              <p role="alert" className="field-error">
                {mutation.error.message}
              </p>
            )}
          </form>
        </Dialog>
      )}
    </div>
  );
}
