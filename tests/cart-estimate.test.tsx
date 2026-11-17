// @vitest-environment jsdom
import React from "react";
import { it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { CartProvider, useCart } from "../src/lib/cart";
import { CartEstimate } from "../src/components/CartEstimate";
import { defaultStorefront } from "../shared/storefront-defaults";
import { seedProducts } from "../src/data/products";
const mocks = vi.hoisted(() => ({ api: vi.fn(), enabled: true }));
vi.mock("../src/lib/api", () => ({
  isDemo: false,
  catalogue: {
    page: vi.fn(async () => ({ items: [], page: 1, pageSize: 8, total: 0 })),
  },
}));
vi.mock("../src/components/Photo", () => ({ Photo: () => null }));
vi.mock("../src/lib/request", () => ({ api: mocks.api }));
vi.mock("../src/lib/content", () => ({
  useStoreContent: () => ({
    content: {
      storefront: {
        ...defaultStorefront,
        experience: {
          ...defaultStorefront.experience,
          cartRecommendations: mocks.enabled,
        },
      },
      commerce: { pickupEnabled: true },
    },
  }),
}));
function View() {
  const cart = useCart();
  return (
    <>
      <CartEstimate />
      <output data-testid="delivery">{JSON.stringify(cart.delivery)}</output>
    </>
  );
}
function App({ client }: { client: QueryClient }) {
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CartProvider>
          <View />
        </CartProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  mocks.enabled = true;
  mocks.api.mockReset();
  localStorage.setItem(
    "assam-cart-v1",
    JSON.stringify([
      {
        key: "sweet-1-0",
        productId: "sweet-1",
        variantId: "sweet-1-0",
        name: "Kaju",
        price: 499,
        quantity: 1,
      },
    ]),
  );
  mocks.api.mockResolvedValue({
    subtotal: 499,
    shipping: 49,
    discount: 0,
    total: 548,
    earliestDate: "2099-01-01",
    deliveryLabel: "Local delivery",
  });
});
afterEach(cleanup);
it("recalculates unchanged inputs on every explicit submission", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(<App client={client} />);
  fireEvent.change(screen.getByLabelText("Pincode"), {
    target: { value: "786001" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Calculate total" }));
  await screen.findByText("Estimated total");
  expect(mocks.api).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Calculate total" }));
  await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(2));
  client.clear();
});
it("hides cached recommendations when the admin setting is disabled", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity } },
  });
  client.setQueryData(
    ["products", "list", { featured: true, pageSize: 8 }, "page"],
    { items: [seedProducts[1]], page: 1, pageSize: 8, total: 1 },
  );
  const view = render(<App client={client} />);
  expect(screen.getByText("Complete your box")).toBeTruthy();
  mocks.enabled = false;
  view.rerender(<App client={client} />);
  expect(screen.queryByText("Complete your box")).toBeNull();
  client.clear();
});
it("keeps delivery choices when the cart component remounts", async () => {
  const client = new QueryClient();
  const view = render(<App client={client} />);
  fireEvent.change(screen.getByLabelText("Pincode"), {
    target: { value: "786001" },
  });
  fireEvent.change(screen.getByLabelText("Preferred date"), {
    target: { value: "2099-01-01" },
  });
  fireEvent.change(screen.getByLabelText("Coupon (optional)"), {
    target: { value: "SWEET10" },
  });
  fireEvent.change(screen.getByLabelText("Fulfilment"), {
    target: { value: "pickup" },
  });
  view.unmount();
  render(<App client={client} />);
  expect(JSON.parse(screen.getByTestId("delivery").textContent!)).toEqual({
    method: "pickup",
    pincode: "786001",
    date: "2099-01-01",
    coupon: "SWEET10",
  });
  client.clear();
});
