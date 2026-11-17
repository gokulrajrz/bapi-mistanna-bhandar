import { useState } from "react";
import { useStoreContent } from "../lib/content";
import { availableVariant } from "../lib/products";
import { Photo } from "./Photo";
import { Link } from "react-router-dom";
import { Plus, ArrowUpRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type { Product } from "../lib/types";
import { money } from "../lib/config";
import { useCart } from "../lib/cart";
import { productQueries } from "../lib/queries";
export function ProductCard({ product: p }: { product: Product }) {
  const { add } = useCart();
  const client = useQueryClient();
  const v = availableVariant(p);
  const { content } = useStoreContent();
  const [added, setAdded] = useState(false);
  if (!v) return null;
  return (
    <article className="product-card">
      <Link
        className="product-image"
        to={`/products/${p.slug}`}
        onMouseEnter={() => client.prefetchQuery(productQueries.detail(p.slug))}
      >
        <Photo src={p.image} srcSet={p.imageSrcSet} alt={p.name} />
        {content.storefront.experience.badges
          .filter((b) =>
            b.productId
              ? b.productId === p.id
              : b.category && b.category === p.category,
          )
          .slice(0, 1)
          .map((b) => (
            <span key={b.label} className="badge">
              {b.label}
            </span>
          ))}
        <span className="image-arrow">
          <ArrowUpRight size={19} />
        </span>
      </Link>
      <div className="product-title">
        <Link to={`/products/${p.slug}`}>
          <h3>{p.name}</h3>
        </Link>
        {(p.tags.includes("vegetarian") || p.tags.includes("vegan")) && (
          <span
            className="vegetarian"
            title={
              p.tags.includes("vegan") ? "Vegan ingredients" : "Vegetarian"
            }
          >
            ●
          </span>
        )}
      </div>
      <p>{p.description}</p>
      {!!p.ratingCount && (
        <small
          className="product-rating"
          aria-label={`${p.ratingAverage} out of 5 from ${p.ratingCount} reviews`}
        >
          ★ {p.ratingAverage} · {p.ratingCount} reviews
        </small>
      )}
      <div className="product-bottom">
        <div>
          {money(v.price)} <span>/ {v.label}</span>
        </div>
        <button
          className="add-button"
          disabled={!v.stock}
          aria-label={`Add ${p.name} to bag`}
          onClick={() => {
            setAdded(true);
            add({
              key: v.id,
              productId: p.id,
              variantId: v.id,
              name: p.name,
              image: p.image,
              label: v.label,
              price: v.price,
              quantity: 1,
            });
          }}
        >
          {v.stock ? (added ? "✓ ADDED" : "ADD") : "SOLD OUT"}
          <Plus size={14} />
        </button>
      </div>
    </article>
  );
}
