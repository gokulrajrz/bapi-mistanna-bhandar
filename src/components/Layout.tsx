import { SignIn } from "./SignIn";
import { useSession } from "../lib/auth";
import { useStoreContent } from "../lib/content";
import { Photo } from "./Photo";
import { useState, useEffect, lazy, Suspense } from "react";
import { Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import {
  Search,
  ShoppingBag,
  UserRound,
  Menu,
  ArrowRight,
  Flower2,
  MapPin,
  Instagram,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useCart } from "../lib/cart";
import { config, money } from "../lib/config";
import { isDemo } from "../lib/api";
import { productQueries } from "../lib/queries";
import { totals } from "../lib/commerce";
import { Dialog, Quantity, ErrorState } from "./ui";
const CartEstimate = lazy(() =>
  import("./CartEstimate").then((m) => ({ default: m.CartEstimate })),
);
const links = [
  ["Shop", "/shop"],
  ["Gifting", "/gifts"],
  ["Build a box", "/build-a-box"],
  ["Our story", "/story"],
  ["Journal", "/journal"],
];
export function Header() {
  const { content } = useStoreContent();
  const settings = content.settings;
  const storefront = content.storefront;
  const links = storefront.navigation.map((n) => [n.label, n.to]);
  const campaign = content.campaigns[0];
  const [search, setSearch] = useState(false),
    [menu, setMenu] = useState(false),
    [account, setAccount] = useState(false);
  const { items, setOpen } = useCart();
  const location = useLocation();
  useEffect(() => {
    setMenu(false);
  }, [location.pathname]);
  return (
    <>
      <div className="announcement">
        {campaign ? (
          <Link to={`/shop?collection=${campaign.collection.id}`}>
            {campaign.banner}
          </Link>
        ) : (
          storefront.announcement
        )}{" "}
        <span>
          Complimentary shipping on orders{" "}
          {money(content.commerce.freeShipping)}+ <ArrowRight size={13} />
        </span>
      </div>
      <header className="header">
        <Link
          className="brand"
          to="/"
          aria-label={`${settings.name} ${storefront.tagline} home`}
        >
          {storefront.logo ? (
            <img className="brand-logo" src={storefront.logo} alt="" />
          ) : (
            <Flower2 strokeWidth={1.2} />
          )}
          <span>
            {settings.name}
            <small>{storefront.tagline}</small>
          </span>
        </Link>
        <nav className="desktop-nav" aria-label="Main navigation">
          {links.map(([label, to]) => (
            <NavLink key={to} to={to}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="header-actions">
          <Link to="/store" className="store-link">
            Visit us <MapPin size={14} />
          </Link>
          <button
            className="icon-button"
            aria-label="Search sweets"
            onClick={() => setSearch(true)}
          >
            <Search size={20} />
          </button>
          <button
            className="icon-button account-button"
            aria-label="Account"
            onClick={() => setAccount(true)}
          >
            <UserRound size={20} />
          </button>
          <button
            className="icon-button bag-button"
            aria-label={`Open shopping bag, ${items.reduce((n, i) => n + i.quantity, 0)} items`}
            onClick={() => setOpen(true)}
          >
            <ShoppingBag size={20} />
            <span>{items.reduce((n, i) => n + i.quantity, 0)}</span>
          </button>
          <button
            className="icon-button mobile-menu-button"
            aria-label="Open menu"
            onClick={() => setMenu(true)}
          >
            <Menu size={21} />
          </button>
        </div>
      </header>
      {menu && (
        <Dialog title="Explore" onClose={() => setMenu(false)}>
          <nav className="mobile-nav">
            {links
              .concat([
                ["Visit us", "/store"],
                ["Account", "/account"],
              ])
              .map(([label, to]) => (
                <Link key={to} to={to}>
                  {label}
                  <ArrowRight size={18} />
                </Link>
              ))}
          </nav>
        </Dialog>
      )}
      {search && <SearchOverlay onClose={() => setSearch(false)} />}
      {account && <Account onClose={() => setAccount(false)} />}
    </>
  );
}
function Account({ onClose }: { onClose: () => void }) {
  const session = useSession();
  return (
    <Dialog title="A sweeter welcome." onClose={onClose}>
      {session.data?.user ? (
        <>
          <p>Signed in as {session.data.user.email}</p>
          <Link to="/account" className="button" onClick={onClose}>
            Your account & orders
          </Link>
          {session.data.role && (
            <Link
              className="button button-outline"
              to="/admin"
              onClick={onClose}
            >
              Open admin
            </Link>
          )}
        </>
      ) : (
        <SignIn onSuccess={onClose} />
      )}
    </Dialog>
  );
}
function SearchOverlay({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState(""),
    [term, setTerm] = useState("");
  const navigate = useNavigate();
  useEffect(() => {
    const id = setTimeout(() => setTerm(text), 250);
    return () => clearTimeout(id);
  }, [text]);
  const query = useQuery({
    ...productQueries.list({ search: term }),
    enabled: term.trim().length > 0,
  });
  return (
    <Dialog title="Find your little happiness." onClose={onClose}>
      <form
        className="search-form"
        onSubmit={(e) => {
          e.preventDefault();
          navigate(`/shop?search=${encodeURIComponent(text)}`);
          onClose();
        }}
      >
        <Search />
        <input
          autoFocus
          aria-label="Search by sweet, ingredient or occasion"
          placeholder="Try kaju katli, coconut, Bihu…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="icon-button" aria-label="See search results">
          <ArrowRight />
        </button>
      </form>
      {!term ? (
        <p className="muted">A familiar favourite, or something new?</p>
      ) : query.isPending ? (
        <p role="status">Finding something sweet…</p>
      ) : query.isError ? (
        <ErrorState retry={() => query.refetch()} />
      ) : !query.data?.length ? (
        <p>No sweets found. Try “cashew” or “laru”.</p>
      ) : (
        <div className="search-results">
          {query.data?.slice(0, 6).map((p) => (
            <Link to={`/products/${p.slug}`} key={p.id} onClick={onClose}>
              <Photo src={p.image} alt={p.name} />
              <span>
                {p.name}
                <small>{p.category}</small>
              </span>
              <span>{money(p.variants[0].price)}</span>
            </Link>
          ))}
        </div>
      )}
    </Dialog>
  );
}
export function CartDrawer() {
  const { content } = useStoreContent();
  const threshold = content.commerce.freeShipping;
  const { items, open, setOpen, update } = useCart();
  const total = totals(items);
  if (!open) return null;
  return (
    <Dialog
      title={`Your sweet little bag (${items.reduce((n, i) => n + i.quantity, 0)})`}
      drawer
      onClose={() => setOpen(false)}
    >
      {!items.length ? (
        <div className="empty">
          <ShoppingBag size={40} />
          <h3>Good things belong here.</h3>
          <p>Find your favourites and bring a little sweetness home.</p>
          <Link className="button" to="/shop" onClick={() => setOpen(false)}>
            Explore sweets <ArrowRight size={17} />
          </Link>
        </div>
      ) : (
        <>
          <div className="cart-progress">
            <p>
              {total.subtotal >= threshold
                ? "Your bag qualifies for complimentary shipping."
                : `${money(threshold - total.subtotal)} away from complimentary shipping.`}
            </p>
            <progress
              value={Math.min(total.subtotal, threshold)}
              max={threshold}
            />
          </div>
          <div className="cart-items">
            {items.map((i) => (
              <div className="cart-item" key={i.key}>
                <Photo src={i.image} alt={i.name} />
                <div>
                  <h3>{i.name}</h3>
                  <p>
                    {i.label}
                    {i.gift?.recipient && ` · For ${i.gift.recipient}`}
                  </p>
                  <Quantity
                    value={i.quantity}
                    onChange={(n) => update(i.key, n)}
                  />
                  <button
                    className="text-button"
                    onClick={() => update(i.key, 0)}
                  >
                    Remove
                  </button>
                </div>
                <span>{money(i.price * i.quantity)}</span>
              </div>
            ))}
          </div>
          <div className="cart-summary">
            <div>
              <span>Subtotal</span>
              <span>{money(total.subtotal)}</span>
            </div>
            <Suspense fallback={<p>Loading delivery calculator…</p>}>
              <CartEstimate />
            </Suspense>
            <Link
              className="button full"
              to="/checkout"
              onClick={() => setOpen(false)}
            >
              Continue to checkout
              <ArrowRight size={18} />
            </Link>
            <button className="text-button" onClick={() => setOpen(false)}>
              A little more browsing
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}
export function Footer() {
  const { content } = useStoreContent();
  return (
    <footer className="site-footer">
      <div className="footer-top">
        <div>
          {content.storefront.logo ? (
            <img className="brand-logo" src={content.storefront.logo} alt="" />
          ) : (
            <Flower2 size={34} strokeWidth={1} />
          )}
          <h2>{content.storefront.footerTitle}</h2>
          <p>{content.storefront.footerDescription}</p>
        </div>
        {content.storefront.experience.footerColumns.map((column, i) => (
          <div key={i}>
            <span className="eyebrow">{column.title}</span>
            {column.links.map((link, j) => (
              <Link key={j} to={link.to}>
                {link.label}
              </Link>
            ))}
          </div>
        ))}
      </div>
      <div className="footer-bottom">
        <span>
          © {new Date().getFullYear()} {content.settings.name}
        </span>
        <span>{content.storefront.experience.footerSignature}</span>
        <span>
          {isDemo ? "Demo storefront · No real payments" : "Secure checkout"}
        </span>
      </div>
    </footer>
  );
}
