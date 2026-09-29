import { ReviewForm } from "../components/ReviewForm";
import { ProductGallery } from "../components/ProductGallery";
import { useStoreContent } from "../lib/content";
import { useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Gift as GiftIcon,
  Leaf,
  PackageCheck,
  Plus,
  ZoomIn,
} from "lucide-react";
import { productQueries } from "../lib/queries";
import { useCart } from "../lib/cart";
import { money, config } from "../lib/config";
import {
  Dialog,
  Quantity,
  Loading,
  ErrorState,
  SectionHeading,
} from "../components/ui";
import { ProductCard } from "../components/ProductCard";
import { Photo } from "../components/Photo";
import type { Gift, Product as ProductType } from "../lib/types";
export default function Product() {
  const { slug = "" } = useParams();
  const query = useQuery(productQueries.detail(slug));
  return (
    <div className="section product-page">
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <ErrorState retry={() => query.refetch()} />
      ) : !query.data ? (
        <div className="empty">
          <h1>This sweet isn’t on our shelf.</h1>
          <Link className="button" to="/shop">
            Explore sweets
          </Link>
        </div>
      ) : (
        <ProductDetails key={slug} product={query.data} />
      )}
    </div>
  );
}
function ProductDetails({ product: p }: { product: ProductType }) {
  const { content } = useStoreContent();
  const [variant, setVariant] = useState(0),
    [quantity, setQuantity] = useState(1),
    [photo, setPhoto] = useState(0),
    [zoom, setZoom] = useState(false),
    [gifting, setGifting] = useState(false);
  const [gift, setGift] = useState<Gift>({
    recipient: "",
    sender: "",
    message: "",
    date: "",
    wrap: false,
  });
  const cart = useCart(),
    navigate = useNavigate();
  const reviews = useQuery(productQueries.reviews(p.id));
  const related = useQuery(productQueries.list({ category: p.category }));
  const v = p.variants[variant];
  function add(buy = false) {
    cart.add({
      key: gifting ? `${v.id}-${crypto.randomUUID()}` : v.id,
      productId: p.id,
      variantId: v.id,
      name: p.name,
      image: p.image,
      label: v.label,
      price: v.price + (gifting && gift.wrap ? content.commerce.wrapFee : 0),
      quantity,
      ...(gifting ? { gift } : {}),
    });
    if (buy) {
      cart.setOpen(false);
      navigate("/checkout");
    }
  }
  return (
    <>
      <div className="breadcrumb">
        <Link to="/">Home</Link>
        <span>/</span>
        <Link to="/shop">Sweets</Link>
        <span>/</span>
        {p.name}
      </div>
      <div className="product-detail">
        <div>
          <ProductGallery
            images={p.gallery}
            srcSets={p.gallerySrcSets}
            name={p.name}
          />
          <small className="muted">
            Illustrative photography. Actual presentation may vary.
          </small>
        </div>
        <div className="detail-copy">
          <span className="eyebrow">{p.category}</span>
          <h1>{p.name}</h1>
          <p className="detail-description">{p.description}</p>
          <p className="vegetarian-note">
            <span className="vegetarian">●</span> Vegetarian · Made to be shared
          </p>
          <span className="field-label">
            Choose a little. Or a little more.
          </span>
          <div className="variant-selector">
            {p.variants.map((v, i) => (
              <button
                className={variant === i ? "selected" : ""}
                onClick={() => {
                  setVariant(i);
                  setQuantity(1);
                }}
                key={v.id}
              >
                {v.label}
              </button>
            ))}
          </div>
          <div className="detail-price">
            {money(v.price)}
            <small>Inclusive of applicable taxes</small>
          </div>
          <div className="buy-actions">
            <Quantity
              value={quantity}
              max={Math.min(v.stock, 30)}
              onChange={(n) => setQuantity(Math.max(1, n))}
            />
            <button
              disabled={!v.stock}
              className="button"
              onClick={() => add()}
            >
              {v.stock ? "Add to bag" : "Currently unavailable"}
              <Plus size={17} />
            </button>
          </div>
          <button
            className="button button-outline full"
            disabled={!v.stock}
            onClick={() => add(true)}
          >
            Buy now <ArrowRight size={16} />
          </button>
          <button className="gift-toggle" onClick={() => setGifting(!gifting)}>
            <GiftIcon size={18} />{" "}
            {gifting ? "Hide gifting options" : "Make it a gift"} <span>+</span>
          </button>
          {gifting && (
            <div className="gift-fields">
              <div className="form-grid">
                <label>
                  To
                  <input
                    value={gift.recipient}
                    maxLength={100}
                    onChange={(e) =>
                      setGift({ ...gift, recipient: e.target.value })
                    }
                  />
                </label>
                <label>
                  From
                  <input
                    value={gift.sender}
                    maxLength={100}
                    onChange={(e) =>
                      setGift({ ...gift, sender: e.target.value })
                    }
                  />
                </label>
              </div>
              <label>
                Your note
                <textarea
                  maxLength={500}
                  value={gift.message}
                  onChange={(e) =>
                    setGift({ ...gift, message: e.target.value })
                  }
                />
              </label>
              <label>
                Preferred gift date
                <input
                  type="date"
                  min={new Date().toLocaleDateString("en-CA")}
                  value={gift.date}
                  onChange={(e) => setGift({ ...gift, date: e.target.value })}
                />
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={gift.wrap}
                  onChange={(e) => setGift({ ...gift, wrap: e.target.checked })}
                />
                Gift wrap · {money(content.commerce.wrapFee)}
              </label>
            </div>
          )}
          <div className="detail-promises">
            <span>
              <Leaf size={18} /> Thoughtfully made
            </span>
            <span>
              <PackageCheck size={18} /> Carefully packed
            </span>
          </div>
          {[
            ["What goes in", p.ingredients.join(", ")],
            [
              "Allergen information",
              p.allergens.length
                ? `Contains ${p.allergens.join(", ")}. Prepared in a kitchen that handles milk, nuts, gluten and sesame.`
                : "Prepared in a kitchen that handles milk, nuts, gluten and sesame.",
            ],
            [
              "Shelf life & storage",
              `${p.shelfLife} from preparation. Store sealed in a cool, dry place; refrigerate milk sweets. Product specifications are demo data pending shop confirmation.`,
            ],
            [
              "Delivery & pickup",
              "Delivery eligibility depends on your pincode and the freshness needs of your sweets. Pickup is available at checkout. Final fulfilment details must be confirmed by the store.",
            ],
          ].map(([title, text]) => (
            <details key={title}>
              <summary>{title}</summary>
              <p>{text}</p>
            </details>
          ))}
        </div>
      </div>
      <section className="reviews">
        {content.operations.reviewSubmissions && (
          <ReviewForm productId={p.id} />
        )}
        <h2>Sweet words.</h2>
        {reviews.isPending ? (
          <p>Loading reviews…</p>
        ) : reviews.isError ? (
          <ErrorState retry={() => reviews.refetch()} />
        ) : reviews.data.length ? (
          reviews.data.map((r) => (
            <article key={r.id}>
              <strong>{r.name}</strong>
              <span>
                {" "}
                · {r.rating}/5 {r.verified ? "· Verified purchase" : ""}
              </span>
              <p>{r.body}</p>
              <small>{new Date(r.created_at).toLocaleDateString()}</small>
            </article>
          ))
        ) : (
          <p>No reviews yet. Your next favourite could be the first.</p>
        )}
      </section>
      <section>
        <SectionHeading
          eyebrow="A LITTLE MORE TO LOVE"
          title="Good company for your sweet."
        />
        <div className="product-grid">
          {related.data
            ?.filter((item) => item.id !== p.id)
            .slice(0, 4)
            .map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
        </div>
      </section>
      {zoom && (
        <Dialog title={p.name} onClose={() => setZoom(false)}>
          <Photo className="zoom-photo" src={p.gallery[photo]} alt={p.name} />
        </Dialog>
      )}
    </>
  );
}
