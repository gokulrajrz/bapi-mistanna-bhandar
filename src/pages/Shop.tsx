import { useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { SlidersHorizontal, X } from "lucide-react";
import { productQueries } from "../lib/queries";
import { useStoreContent } from "../lib/content";
import { ProductCard } from "../components/ProductCard";
import { Loading, ErrorState } from "../components/ui";
export default function Shop() {
  const [params, setParams] = useSearchParams();
  const { content } = useStoreContent();
  const categories = content.categories;
  const collection = content.collections.find(
    (c) => c.id === params.get("collection"),
  );
  const filters = {
    page: Math.max(1, Number(params.get("page")) || 1),
    pageSize: 12,
    collection: params.get("collection") || undefined,
    search: params.get("search") || "",
    category: params.get("category") || "",
    sort: params.get("sort") || "popular",
    occasion: params.get("occasion") || "",
    maxPrice: Number(params.get("maxPrice")) || undefined,
    dietary: params.get("dietary") || "",
    available: params.get("available") === "true",
  };
  const query = useQuery(productQueries.page(filters));
  function change(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next);
  }
  return (
    <div className="section shop-page">
      <div className="breadcrumb">
        <Link to="/">Home</Link>
        <span>/</span>Shop sweets
      </div>
      <div className="page-intro">
        <span className="eyebrow">A LITTLE SOMETHING FOR EVERYONE</span>
        <h1>
          {collection
            ? collection.title
            : filters.occasion === "bihu"
              ? "A sweet beginning."
              : "Find your kind of sweet."}
        </h1>
        <p>
          {collection?.description ||
            "Old favourites. New discoveries. All made for sharing."}
        </p>
        {collection?.hero && (
          <img
            className="collection-hero"
            src={collection.hero}
            alt={collection.title}
          />
        )}
      </div>
      <div className="category-tabs">
        <button
          className={!filters.category ? "active" : ""}
          onClick={() => change("category", "")}
        >
          All sweets
        </button>
        {categories.map((c) => (
          <button
            key={c}
            className={filters.category === c ? "active" : ""}
            onClick={() => change("category", c)}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="filter-bar">
        <span>
          <SlidersHorizontal size={16} /> Refine your cravings
        </span>
        <label>
          <span className="sr-only">Price range</span>
          <select
            value={filters.maxPrice || ""}
            onChange={(e) => change("maxPrice", e.target.value)}
          >
            <option value="">All prices</option>
            <option value="300">Under ₹300</option>
            <option value="500">Under ₹500</option>
            <option value="1000">Under ₹1,000</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Dietary preference</span>
          <select
            value={filters.dietary}
            onChange={(e) => change("dietary", e.target.value)}
          >
            <option value="">All dietary</option>
            <option value="vegan">Vegan ingredients</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Occasion</span>
          <select
            value={filters.occasion}
            onChange={(e) => change("occasion", e.target.value)}
          >
            <option value="">Every occasion</option>
            <option value="bihu">Bihu</option>
            <option value="festival">Festivals</option>
            <option value="gifting">Gifting</option>
            <option value="wedding">Weddings</option>
            <option value="corporate">Corporate</option>
          </select>
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={filters.available}
            onChange={(e) =>
              change("available", e.target.checked ? "true" : "")
            }
          />{" "}
          In stock
        </label>
        <label className="sort">
          <span className="sr-only">Sort products</span>
          <select
            value={filters.sort}
            onChange={(e) => change("sort", e.target.value)}
          >
            <option value="popular">Our favourites</option>
            <option value="newest">Newest</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
          </select>
        </label>
      </div>
      {filters.search && (
        <p className="search-chip">
          Results for “{filters.search}”{" "}
          <button
            className="icon-button"
            aria-label="Clear search"
            onClick={() => change("search", "")}
          >
            <X size={16} />
          </button>
        </p>
      )}
      <p className="results-count" aria-live="polite">
        {query.isFetching
          ? "Finding your favourites…"
          : `${query.data?.total || 0} little reasons to smile`}
      </p>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <ErrorState retry={() => query.refetch()} />
      ) : query.data.items.length ? (
        <div
          className="product-grid catalog-grid"
          style={{ opacity: query.isPlaceholderData ? 0.6 : 1 }}
        >
          {query.data.items.map((p) => (
            <ProductCard product={p} key={p.id} />
          ))}
        </div>
      ) : (
        <div className="empty">
          <h2>No sweets in this selection.</h2>
          <p>There’s still something lovely waiting for you.</p>
          <button className="button" onClick={() => setParams({})}>
            Explore all sweets
          </button>
        </div>
      )}
      {!!query.data && query.data.total > 12 && (
        <nav className="pagination" aria-label="Catalogue pages">
          <button
            disabled={filters.page <= 1 || query.isPlaceholderData}
            onClick={() => change("page", String(filters.page - 1))}
          >
            Previous
          </button>
          <span>
            Page {filters.page} of {Math.ceil(query.data.total / 12)}
          </span>
          <button
            disabled={
              filters.page * 12 >= query.data.total || query.isPlaceholderData
            }
            onClick={() => change("page", String(filters.page + 1))}
          >
            Next
          </button>
        </nav>
      )}
    </div>
  );
}
