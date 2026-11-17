// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CartProvider, useCart } from "../src/lib/cart";
import { CartSync } from "../src/components/CartSync";
const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  session: { data: { user: { id: "customer-a" } }, isPending: false },
}));
vi.mock("../src/lib/auth", () => ({ useSession: () => mocks.session }));
vi.mock("../src/lib/request", () => ({ api: mocks.api }));
const item = {
  key: "sweet-1-0",
  productId: "sweet-1",
  variantId: "sweet-1-0",
  name: "Kaju Katli",
  image: "/images/hero.webp",
  label: "250 g",
  price: 499,
  quantity: 1,
};
function Bag() {
  const cart = useCart();
  return (
    <>
      <button onClick={() => cart.add(item)}>Add</button>
      <span data-testid="bag">
        {cart.items.reduce((sum, i) => sum + i.quantity, 0)}
      </span>
    </>
  );
}
function mount() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <CartProvider>
        <CartSync />
        <Bag />
      </CartProvider>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  localStorage.clear();
  mocks.api.mockReset();
});
afterEach(cleanup);
it("resolves a stale revision using a fresh fetch before keeping the local bag", async () => {
  let reads = 0;
  mocks.api.mockImplementation(async (_path, opts) => {
    if (!opts?.method) return { items: [], revision: ++reads === 1 ? 1 : 8 };
    const input = JSON.parse(opts.body);
    if (input.revision === 1)
      throw new Error("Your bag changed on another device.");
    expect(input.revision).toBe(8);
    return { items: input.items, revision: 9 };
  });
  mount();
  await waitFor(() =>
    expect(localStorage.getItem("bapi-cart-owner")).toBe("customer-a"),
  );
  fireEvent.click(screen.getByText("Add"));
  await screen.findByText(
    /Your bag changed on another device/,
    {},
    { timeout: 2500 },
  );
  fireEvent.click(screen.getByText("Keep this device’s bag"));
  await waitFor(() =>
    expect(screen.queryByText("Keep this device’s bag")).toBeNull(),
  );
  expect(screen.getByTestId("bag").textContent).toBe("1");
  expect(localStorage.getItem("bapi-cart-dirty")).toBeNull();
});
it("can choose the remote bag without writing over it", async () => {
  localStorage.setItem("bapi-cart-owner", "customer-a");
  localStorage.setItem("bapi-cart-dirty", "true");
  localStorage.setItem("assam-cart-v1", JSON.stringify([item]));
  mocks.api.mockResolvedValue({
    items: [{ ...item, quantity: 3 }],
    revision: 7,
  });
  mount();
  fireEvent.click(await screen.findByText("Load saved bag"));
  await waitFor(() => expect(screen.getByTestId("bag").textContent).toBe("3"));
  expect(mocks.api.mock.calls.every(([, opts]) => !opts?.method)).toBe(true);
});
it("retains local edits if conflict resolution itself fails", async () => {
  localStorage.setItem("bapi-cart-owner", "customer-a");
  localStorage.setItem("bapi-cart-dirty", "true");
  localStorage.setItem("assam-cart-v1", JSON.stringify([item]));
  mocks.api
    .mockResolvedValueOnce({ items: [], revision: 1 })
    .mockRejectedValue(new Error("Connection interrupted"));
  mount();
  fireEvent.click(await screen.findByText("Keep this device’s bag"));
  await screen.findByText(/Connection interrupted/);
  expect(screen.getByTestId("bag").textContent).toBe("1");
});
