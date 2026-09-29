import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import type { CartItem } from "./types";
const CartContext = createContext<null | {
  items: CartItem[];
  add: (item: CartItem) => void;
  update: (key: string, quantity: number) => void;
  clear: () => void;
  replace: (items: CartItem[]) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
}>(null);
export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const v = JSON.parse(localStorage.getItem("assam-cart-v1") || "[]");
      return Array.isArray(v)
        ? v.filter(
            (i) =>
              typeof i.key === "string" &&
              Number.isFinite(i.price) &&
              Number.isInteger(i.quantity) &&
              i.quantity > 0,
          )
        : [];
    } catch {
      return [];
    }
  });
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem("assam-cart-v1", JSON.stringify(items));
    } catch {
      /* In-memory cart remains available. */
    }
  }, [items]);
  return (
    <CartContext.Provider
      value={{
        items,
        open,
        setOpen,
        add: (item) => {
          setItems((old) => {
            const match = old.find((i) => i.key === item.key);
            if (!match && old.length >= 50) return old;
            return match
              ? old.map((i) =>
                  i.key === item.key
                    ? {
                        ...i,
                        quantity: Math.min(30, i.quantity + item.quantity),
                      }
                    : i,
                )
              : [...old, item];
          });
          setOpen(true);
        },
        update: (key, quantity) =>
          setItems((old) =>
            quantity <= 0
              ? old.filter((i) => i.key !== key)
              : old.map((i) =>
                  i.key === key
                    ? { ...i, quantity: Math.min(30, quantity) }
                    : i,
                ),
          ),
        clear: () => setItems([]),
        replace: (items) => setItems(items),
      }}
    >
      {children}
    </CartContext.Provider>
  );
}
export function useCart() {
  const cart = useContext(CartContext);
  if (!cart) throw new Error("CartProvider missing");
  return cart;
}
