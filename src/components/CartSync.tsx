import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "../lib/auth";
import { useCart } from "../lib/cart";
import { api } from "../lib/request";
import type { CartItem } from "../lib/types";
type SavedCart = { items: CartItem[]; revision: number };
function stored(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function persist(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* In-memory bag remains usable. */
  }
}
export function CartSync() {
  const session = useSession(),
    userId = session.data?.user?.id,
    cart = useCart(),
    client = useQueryClient();
  const latest = useRef(cart);
  latest.current = cart;
  const active = useRef<string | undefined>(undefined),
    revision = useRef(1),
    synced = useRef(""),
    saving = useRef(false),
    generation = useRef(0);
  const [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [resolving, setResolving] = useState(false),
    [tick, setTick] = useState(0);
  const query = useQuery({
    queryKey: ["cart", userId],
    queryFn: ({ signal }) => api<SavedCart>("/api/account/cart", { signal }),
    enabled: !!userId,
    staleTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });
  useEffect(() => {
    if (session.isPending) return;
    if (active.current && active.current !== userId) {
      generation.current++;
      latest.current.clear();
      persist("bapi-cart-owner", null);
      persist("bapi-cart-dirty", null);
      setError("");
      setReady(false);
      active.current = undefined;
    }
    if (!userId) {
      setReady(false);
      return;
    }
    if (!query.data || active.current === userId) return;
    active.current = userId;
    generation.current++;
    revision.current = query.data.revision;
    synced.current = JSON.stringify(query.data.items);
    const owner = stored("bapi-cart-owner");
    persist("bapi-cart-owner", userId);
    if (owner === userId && stored("bapi-cart-dirty") === "true") {
      setError("This device has unsynced changes. Choose which bag to keep.");
      return;
    }
    const merged = query.data.items.map((i) => ({ ...i }));
    if (!owner)
      for (const item of latest.current.items) {
        const match = merged.find((i) => i.key === item.key);
        if (match)
          match.quantity = Math.min(30, match.quantity + item.quantity);
        else if (merged.length < 50) merged.push(item);
      }
    latest.current.replace(merged);
    setReady(true);
  }, [userId, query.data, session.isPending]);
  const serialized = JSON.stringify(cart.items);
  useEffect(() => {
    if (
      !ready ||
      !userId ||
      active.current !== userId ||
      error ||
      serialized === synced.current
    )
      return;
    persist("bapi-cart-dirty", "true");
    const epoch = generation.current;
    const timer = setTimeout(async () => {
      if (saving.current) {
        setTick((v) => v + 1);
        return;
      }
      saving.current = true;
      try {
        const data = await api<SavedCart>("/api/account/cart", {
          method: "PUT",
          body: JSON.stringify({
            items: JSON.parse(serialized),
            revision: revision.current,
          }),
        });
        if (epoch !== generation.current || active.current !== userId) return;
        revision.current = data.revision;
        synced.current = serialized;
        client.setQueryData(["cart", userId], data);
        if (JSON.stringify(latest.current.items) === serialized)
          persist("bapi-cart-dirty", null);
      } catch (e) {
        if (epoch === generation.current)
          setError(e instanceof Error ? e.message : "Your bag could not sync.");
      } finally {
        saving.current = false;
        setTick((v) => v + 1);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [serialized, ready, userId, error, tick, client]);
  async function resolve(keepLocal: boolean) {
    if (!userId || resolving) return;
    const epoch = generation.current;
    setResolving(true);
    try {
      const remote = await api<SavedCart>("/api/account/cart");
      if (epoch !== generation.current) return;
      const items = latest.current.items;
      const chosen = keepLocal
        ? await api<SavedCart>("/api/account/cart", {
            method: "PUT",
            body: JSON.stringify({ items, revision: remote.revision }),
          })
        : remote;
      if (epoch !== generation.current) return;
      revision.current = chosen.revision;
      synced.current = JSON.stringify(chosen.items);
      if (!keepLocal) latest.current.replace(chosen.items);
      if (!keepLocal || JSON.stringify(latest.current.items) === synced.current)
        persist("bapi-cart-dirty", null);
      client.setQueryData(["cart", userId], chosen);
      setError("");
      setReady(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your bag could not sync.");
    } finally {
      setResolving(false);
    }
  }
  if (!userId || (!error && !query.isError)) return null;
  return (
    <div className="sync-notice" role="status">
      <span>
        {error || "Your saved bag could not be loaded."} Your bag is still on
        this device.
      </span>
      <button disabled={resolving} onClick={() => resolve(true)}>
        Keep this device’s bag
      </button>
      <button disabled={resolving} onClick={() => resolve(false)}>
        Load saved bag
      </button>
    </div>
  );
}
