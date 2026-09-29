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
  const v = p.variants[0];
  return (
    <article className="product-card">
      <Link
        className="product-image"
        to={`/products/${p.slug}`}
        onMouseEnter={() => client.prefetchQuery(productQueries.detail(p.slug))}
      >
        <Photo src={p.image} srcSet={p.imageSrcSet} alt={p.name} />
        {p.category === "Assamese specialties" && (
          <span className="badge">A TASTE OF ASSAM</span>
        )}
        {p.id === "sweet-1" && <span className="badge">THE CLASSIC</span>}
        <span className="image-arrow">
          <ArrowUpRight size={19} />
        </span>
      </Link>
      <div className="product-title">
        <Link to={`/products/${p.slug}`}>
          <h3>{p.name}</h3>
        </Link>
        <span className="vegetarian" title="Vegetarian">
          ●
        </span>
      </div>
      <p>{p.description}</p>
      <div className="product-bottom">
        <div>
          {money(v.price)} <span>/ {v.label}</span>
        </div>
        <button
          className="add-button"
          disabled={!v.stock}
          aria-label={`Add ${p.name} to bag`}
          onClick={() =>
            add({
              key: v.id,
              productId: p.id,
              variantId: v.id,
              name: p.name,
              image: p.image,
              label: v.label,
              price: v.price,
              quantity: 1,
            })
          }
        >
          {v.stock ? "ADD" : "SOLD OUT"}
          <Plus size={14} />
        </button>
      </div>
    </article>
  );
}
