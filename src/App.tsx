import { CartSync } from "./components/CartSync";
import { useStoreContent } from "./lib/content";
import { ErrorState } from "./components/ui";
import { lazy, Suspense, useEffect } from "react";
import { Routes, Route, useLocation, Link } from "react-router-dom";
import { Header, CartDrawer, Footer } from "./components/Layout";
import { config } from "./lib/config";
import Home from "./pages/Home";
const Shop = lazy(() => import("./pages/Shop"));
const Product = lazy(() => import("./pages/Product"));
const Builder = lazy(() => import("./pages/Builder"));
const Checkout = lazy(() => import("./pages/Checkout"));
const Story = lazy(() =>
  import("./pages/Content").then((m) => ({ default: m.Story })),
);
const Gifts = lazy(() =>
  import("./pages/Content").then((m) => ({ default: m.Gifts })),
);
const Journal = lazy(() =>
  import("./pages/Content").then((m) => ({ default: m.Journal })),
);
const Article = lazy(() =>
  import("./pages/Content").then((m) => ({ default: m.Article })),
);
const Store = lazy(() =>
  import("./pages/Content").then((m) => ({ default: m.Store })),
);
const Policies = lazy(() =>
  import("./pages/Content").then((m) => ({ default: m.Policies })),
);
const AccountPage = lazy(() => import("./pages/Account"));
const OrderPage = lazy(() => import("./pages/Order"));
const AdminPage = lazy(() => import("./pages/Admin"));
function PageMeta() {
  const { pathname } = useLocation();
  const { content } = useStoreContent();
  useEffect(() => {
    window.scrollTo(0, 0);
    const title =
      pathname === "/"
        ? "The taste of Assam"
        : pathname.split("/").filter(Boolean).at(-1)?.replaceAll("-", " ") ||
          "";
    document.title = `${title.charAt(0).toUpperCase() + title.slice(1)} | ${content.settings.name}`;
    let canonical = document.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]',
    );
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.append(canonical);
    }
    canonical.href = config.site + pathname;
    const description = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    );
    if (description) description.content = content.storefront.seoDescription;
    const ogTitle = document.querySelector<HTMLMetaElement>(
      'meta[property="og:title"]',
    );
    if (ogTitle) ogTitle.content = document.title;
  }, [pathname, content.settings.name, content.storefront.seoDescription]);
  return null;
}
export default function App() {
  const location = useLocation();
  const { content, isPending, isError, refetch } = useStoreContent();
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--burgundy",
      content.storefront.primaryColor,
    );
    document.documentElement.style.setProperty(
      "--cream",
      content.storefront.backgroundColor,
    );
  }, [content.storefront.primaryColor, content.storefront.backgroundColor]);
  if (location.pathname.startsWith("/admin"))
    return (
      <Suspense fallback={<div className="section">Loading store studio…</div>}>
        <AdminPage />
      </Suspense>
    );
  if (isPending)
    return (
      <div className="section" role="status">
        Preparing a little sweetness…
      </div>
    );
  if (isError)
    return (
      <div className="section">
        <ErrorState retry={() => refetch()} />
      </div>
    );
  if (content.operations.maintenanceMode)
    return (
      <div className="section empty">
        <h1>{content.settings.name}</h1>
        <p>{content.operations.maintenanceMessage}</p>
        <Link to="/admin">Store administration</Link>
      </div>
    );
  return (
    <>
      <PageMeta />
      <CartSync />
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Header />
      <main id="main">
        <Suspense
          fallback={
            <div className="section loading-page" role="status">
              Preparing a little sweetness…
            </div>
          }
        >
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/shop" element={<Shop />} />
            <Route path="/products/:slug" element={<Product />} />
            <Route path="/build-a-box" element={<Builder />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/account" element={<AccountPage />} />
            <Route path="/orders/:id" element={<OrderPage />} />
            <Route path="/story" element={<Story />} />
            <Route path="/gifts" element={<Gifts />} />
            <Route path="/journal" element={<Journal />} />
            <Route path="/journal/:slug" element={<Article />} />
            <Route path="/store" element={<Store />} />
            <Route path="/policies" element={<Policies />} />
            <Route
              path="*"
              element={
                <div className="section empty">
                  <h1>A little off the beaten path.</h1>
                  <Link className="button" to="/">
                    Come back home
                  </Link>
                </div>
              }
            />
          </Routes>
        </Suspense>
      </main>
      <Footer />
      <CartDrawer />
    </>
  );
}
