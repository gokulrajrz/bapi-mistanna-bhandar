import { catalogue } from "../lib/api";
import { useStoreContent } from "../lib/content";
import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Gift, ArrowRight, Flower2 } from "lucide-react";
import { productQueries } from "../lib/queries";
import { boxPrice } from "../lib/commerce";
import { config, money } from "../lib/config";
import { useCart } from "../lib/cart";
import { Photo } from "../components/Photo";
import { Quantity, Loading, ErrorState } from "../components/ui";
export default function Builder() {
  return (
    <div className="section">
      <div className="page-intro">
        <span className="eyebrow">
          THOUGHTFULLY PICKED. BEAUTIFULLY PACKED.
        </span>
        <h1>
          A box full of <em>you.</em>
        </h1>
        <p>You choose the sweets. We make the occasion.</p>
      </div>
      <GiftBoxBuilder />
    </div>
  );
}
export function GiftBoxBuilder() {
  const { content } = useStoreContent();
  const query = useInfiniteQuery({
    queryKey: ["products", "builder"],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      catalogue.page({ page: pageParam, pageSize: 12 }, signal),
    getNextPageParam: (p) =>
      p.page * p.pageSize < p.total ? p.page + 1 : undefined,
  });
  const { add } = useCart();
  const [size, setSize] = useState(6),
    [pieces, setPieces] = useState<Record<string, number>>({}),
    [message, setMessage] = useState(""),
    [recipient, setRecipient] = useState(""),
    [sender, setSender] = useState(""),
    [date, setDate] = useState(""),
    [wrap, setWrap] = useState(false);
  const count = Object.values(pieces).reduce((a, b) => a + b, 0);
  if (query.isPending) return <Loading />;
  if (query.isError) return <ErrorState retry={() => query.refetch()} />;
  const products = query.data.pages
    .flatMap((p) => p.items)
    .filter((p) => p.category !== "Gift boxes");
  const price = boxPrice(pieces, products, wrap, content.commerce);
  const selected = Object.entries(pieces)
    .flatMap(([id, q]) =>
      Array.from({ length: q }, () => products.find((p) => p.id === id)!),
    )
    .filter(Boolean);
  return (
    <div className="builder-layout">
      <div>
        <h2>
          <span className="step">01</span> Make a little room.
        </h2>
        <div className="box-sizes">
          {[6, 12, 18, 24].map((n) => (
            <button
              key={n}
              className={size === n ? "selected" : ""}
              disabled={n < count}
              onClick={() => setSize(n)}
            >
              <Gift size={22} />
              <strong>{n} pieces</strong>
              <small>
                {n === 6
                  ? "A little joy"
                  : n === 12
                    ? "Double the love"
                    : n === 18
                      ? "Made to share"
                      : "For everyone"}
              </small>
            </button>
          ))}
        </div>
        <h2>
          <span className="step">02</span> Pick their favourites.
        </h2>
        <div className="builder-products">
          {products.map((p) => (
            <div key={p.id}>
              <Photo src={p.image} alt={p.name} />
              <span>
                <strong>{p.name}</strong>
                <small>{money(p.piecePrice)} / piece</small>
              </span>
              <Quantity
                value={pieces[p.id] || 0}
                max={Math.min((pieces[p.id] || 0) + size - count, p.pieceStock)}
                onChange={(n) =>
                  setPieces({ ...pieces, [p.id]: Math.max(0, n) })
                }
              />
            </div>
          ))}
        </div>
        {query.hasNextPage && (
          <button
            className="button button-outline"
            disabled={query.isFetchingNextPage}
            onClick={() => query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? "Loading…" : "More sweets"}
          </button>
        )}
      </div>
      <aside className="box-preview-panel">
        <span className="eyebrow">YOUR LITTLE BOX OF HAPPINESS</span>
        <div className="box-preview">
          {Array.from({ length: size }, (_, i) => (
            <div key={i} className={selected[i] ? "filled" : ""}>
              {selected[i] ? (
                <Photo src={selected[i].image} alt={selected[i].name} />
              ) : (
                <Flower2 size={23} strokeWidth={1} />
              )}
            </div>
          ))}
        </div>
        <div className="box-counter">
          <strong>
            {count} / {size} pieces
          </strong>
          <span>
            {size - count
              ? `${size - count} little spaces left`
              : "A perfect little collection."}
          </span>
        </div>
        <h3>A note from the heart.</h3>
        <div className="form-grid">
          <label>
            To
            <input
              value={recipient}
              maxLength={100}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="Their name"
            />
          </label>
          <label>
            From
            <input
              value={sender}
              maxLength={100}
              onChange={(e) => setSender(e.target.value)}
              placeholder="Your name"
            />
          </label>
        </div>
        <label>
          Gift message
          <textarea
            placeholder="Some things are sweeter when said…"
            maxLength={500}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </label>
        <label>
          Preferred delivery date
          <input
            type="date"
            min={new Date().toLocaleDateString("en-CA")}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={wrap}
            onChange={(e) => setWrap(e.target.checked)}
          />{" "}
          Add gift wrapping · {money(content.commerce.wrapFee)}
        </label>
        <div className="price-line">
          <span>Box & packing</span>
          <span>{money(content.commerce.boxFee)}</span>
        </div>
        <div className="price-line">
          <strong>Your box total</strong>
          <strong>{money(price)}</strong>
        </div>
        <button
          className="button full"
          disabled={count !== size}
          onClick={() =>
            add({
              key: crypto.randomUUID(),
              productId: "custom-box",
              variantId: `box-${size}`,
              name: "Your signature mithai box",
              image: "/images/hero.webp",
              label: `${size} handpicked pieces`,
              price,
              quantity: 1,
              box: {
                size,
                pieces: Object.fromEntries(
                  Object.entries(pieces).filter(([, q]) => q > 0),
                ),
              },
              gift: { recipient, sender, message, date, wrap },
            })
          }
        >
          {count === size
            ? "Add your box to bag"
            : `Choose ${size - count} more ${size - count === 1 ? "sweet" : "sweets"}`}
          <ArrowRight size={17} />
        </button>
      </aside>
    </div>
  );
}
