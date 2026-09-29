import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "../lib/auth";
import { useCart } from "../lib/cart";
import { api } from "../lib/request";
import type { CartItem } from "../lib/types";
export function CartSync() {
  const session = useSession();
  const userId = session.data?.user?.id;
  const cart = useCart();
  const latest = useRef(cart);
  latest.current = cart;
  const activeUser = useRef<string | undefined>(undefined),
    revision = useRef(1),
    synced = useRef(""),
    saving = useRef(false);
  const [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [tick, setTick] = useState(0);
  const query = useQuery({
    queryKey: ["cart", userId],
    queryFn: ({ signal }) =>
      api<{ items: CartItem[]; revision: number }>("/api/account/cart", {
        signal,
      }),
    enabled: !!userId,
    staleTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });
  useEffect(() => {
    if (!userId) {
      if (activeUser.current) {
        latest.current.clear();
        localStorage.removeItem("bapi-cart-owner");
        localStorage.removeItem("bapi-cart-dirty");
      }
      activeUser.current = undefined;
      setReady(false);
      return;
    }
    if (!query.data || activeUser.current === userId) return;
    const owner = localStorage.getItem("bapi-cart-owner");
    const remote = query.data.items;
    const incoming = !owner ? latest.current.items : [];
    // Preserve unsynced local edits belonging to this account on reload.
    if (
      owner === userId &&
      localStorage.getItem("bapi-cart-dirty") === "true"
    ) {
      revision.current = query.data.revision;
      synced.current = JSON.stringify(remote);
      activeUser.current = userId;
      setError("This device has unsynced changes. Choose which bag to keep.");
      return;
    }
    const merged = remote.map((i) => ({ ...i }));
    for (const item of incoming) {
      const found = merged.find((i) => i.key === item.key);
      if (found) found.quantity = Math.min(30, found.quantity + item.quantity);
      else merged.push(item);
    }
    revision.current = query.data.revision;
    synced.current = JSON.stringify(remote);
    activeUser.current = userId;
    localStorage.setItem("bapi-cart-owner", userId);
    latest.current.replace(merged);
    setReady(true);
  }, [userId, query.data]);
  const serialized = JSON.stringify(cart.items);
  useEffect(() => {
    if (!ready || !userId || error || serialized === synced.current) return;
    localStorage.setItem("bapi-cart-dirty", "true");
    const savingFor = userId;
    const timer = setTimeout(async () => {
      if (saving.current) {
        setTick((v) => v + 1);
        return;
      }
      saving.current = true;
      try {
        const data = await api<{ items: CartItem[]; revision: number }>(
          "/api/account/cart",
          {
            method: "PUT",
            body: JSON.stringify({
              items: JSON.parse(serialized),
              revision: revision.current,
            }),
          },
        );
        if (activeUser.current !== savingFor) return;
        localStorage.removeItem("bapi-cart-dirty");
        revision.current = data.revision;
        synced.current = serialized;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Your bag could not sync.");
      } finally {
        saving.current = false;
        setTick((v) => v + 1);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [serialized, ready, userId, error, tick]);
  if (!error && !query.isError) return null;
  return (
    <div className="sync-notice" role="status">
      <span>
        {error || "Your saved bag could not be loaded."} Your current bag is
        still on this device.
      </span>
      <button
        onClick={() => {
          setError("");
          setReady(true);
        }}
      >
        Keep this device’s bag
      </button>
      <button
        onClick={async () => {
          const result = await query.refetch();
          if (result.data) {
            localStorage.removeItem("bapi-cart-dirty");
            revision.current = result.data.revision;
            synced.current = JSON.stringify(result.data.items);
            latest.current.replace(result.data.items);
            setError("");
            setReady(true);
          }
        }}
      >
        Load saved bag
      </button>
    </div>
  );
}
