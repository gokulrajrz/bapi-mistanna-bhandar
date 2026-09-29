import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowUpRight,
  Flower2,
  MapPin,
  Clock,
  MessageCircle,
} from "lucide-react";
import { Photo } from "../components/Photo";
import { useStoreContent } from "../lib/content";
import { isDemo } from "../lib/api";
export function Story() {
  const { content } = useStoreContent();
  return (
    <>
      <section className="story-hero section">
        <span className="eyebrow">ROOTED IN ASSAM</span>
        <h1>{content.storefront.storyTitle}</h1>
        <p>Sweetness is a language we’ve always known.</p>
        <Photo src={content.storefront.heroImage} alt="Mithai from Assam" />
      </section>
      <section className="story-body section">
        <Flower2 size={46} strokeWidth={1} />
        <h2>From our side of the table.</h2>
        {content.storefront.storyParagraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
        <div className="making-sequence">
          {["Milk", "Sugar", "Fire", "Time", "Sweetness"].map((word, i) => (
            <div key={word}>
              <small>0{i + 1}</small>
              <h3>{word}</h3>
            </div>
          ))}
        </div>
        <Link className="button" to="/shop">
          A taste of our story <ArrowUpRight size={17} />
        </Link>
      </section>
    </>
  );
}
export function Gifts() {
  const [params] = useSearchParams();
  const { content } = useStoreContent();
  return (
    <div className="section">
      <div className="page-intro">
        <span className="eyebrow">ASSAM, IN A BOX</span>
        <h1>{content.storefront.giftsTitle}</h1>
        <p>{content.storefront.giftsDescription}</p>
      </div>
      <div className="gifting-hero">
        <Photo
          src={content.storefront.heroImage}
          alt="Mithai for thoughtful gifting"
        />
        <div>
          <span className="eyebrow">A GIFT WITH A LITTLE MORE HEART</span>
          <h2>
            Their favourites.
            <br />
            Your thoughtful touch.
          </h2>
          <p>
            Choose the sweets, add a personal message, and make a little room
            for joy.
          </p>
          <Link className="button" to="/build-a-box">
            Make it personal <ArrowUpRight size={17} />
          </Link>
        </div>
      </div>
      <div className="gifting-types">
        {[
          ["Personal", "For the just-because moments.", "/build-a-box"],
          [
            "Wedding",
            "For new beginnings, beautifully shared.",
            "/store?enquiry=wedding",
          ],
          [
            "Corporate",
            "For the people who make it happen.",
            "/store?enquiry=corporate",
          ],
          [
            "Festivals",
            "Familiar flavours for coming together.",
            "/shop?occasion=festival",
          ],
        ].map(([title, text, to]) => (
          <Link
            className={
              params.get("type") === title.toLowerCase() ? "selected" : ""
            }
            to={to}
            key={title}
          >
            <Flower2 size={32} strokeWidth={1} />
            <h2>{title}</h2>
            <p>{text}</p>
            <ArrowUpRight />
          </Link>
        ))}
      </div>
    </div>
  );
}
export function Journal() {
  const { content } = useStoreContent();
  return (
    <div className="section">
      <div className="page-intro">
        <span className="eyebrow">FROM OUR SIDE OF THE TABLE</span>
        <h1>The sweet journal.</h1>
        <p>Culture, craft, and little things worth slowing down for.</p>
      </div>
      <div className="journal-grid">
        {content.posts.map((a) => (
          <Link to={`/journal/${a.slug}`} key={a.slug}>
            <Photo src={a.image} alt={a.title} />
            <span className="eyebrow">{a.tag}</span>
            <h2>{a.title}</h2>
            <span className="text-link">
              Read the story <ArrowUpRight size={16} />
            </span>
          </Link>
        ))}
      </div>
      {!content.posts.length && (
        <div className="empty">
          <h2>New stories are on their way.</h2>
        </div>
      )}
    </div>
  );
}
export function Article() {
  const { slug } = useParams();
  const { content } = useStoreContent();
  const article = content.posts.find((a) => a.slug === slug);
  if (!article)
    return (
      <div className="section empty">
        <h1>Story not found.</h1>
        <Link to="/journal">Back to the journal</Link>
      </div>
    );
  return (
    <article className="section article">
      <Link className="text-link" to="/journal">
        ← Back to the journal
      </Link>
      <span className="eyebrow">{article.tag}</span>
      <h1>{article.title}</h1>
      <Photo src={article.image} alt={article.title} />
      {article.body.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
      <Link className="button" to="/shop">
        Find a little sweetness <ArrowUpRight size={17} />
      </Link>
    </article>
  );
}
export function Store() {
  const [params] = useSearchParams();
  const { content } = useStoreContent();
  const s = content.settings;
  return (
    <div className="section">
      <div className="page-intro">
        <span className="eyebrow">A WARM WELCOME AWAITS</span>
        <h1>
          Come for a little <em>sweetness.</em>
        </h1>
        <p>Visit {s.name}, Dibrugarh.</p>
      </div>
      <div className="store-layout">
        <Photo
          src={content.store?.image || content.storefront.heroImage}
          alt={
            content.store?.image
              ? `${s.name} store`
              : "Illustrative selection of mithai"
          }
        />
        <div>
          <MapPin size={27} />
          <h2>Find us in Dibrugarh.</h2>
          <address>{s.address}</address>
          {s.address && (
            <a
              className="arrow-link"
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address)}`}
              target="_blank"
              rel="noreferrer"
            >
              Get directions <ArrowUpRight size={16} />
            </a>
          )}
          <Clock size={25} />
          <h3>Opening hours</h3>
          <p style={{ whiteSpace: "pre-line" }}>
            {content.store?.hours ||
              s.hours ||
              "Please contact the store to confirm today’s opening hours."}
          </p>
          {s.pickupInstructions && <p>{s.pickupInstructions}</p>}
          {content.operations.bulkEnquiries && (
            <>
              <MessageCircle size={25} />
              <h3>Something bigger in mind?</h3>
              <p>
                For wedding celebrations, corporate gifts, or a very sweet idea,
                talk to us about a thoughtful assortment.
              </p>
              {s.phone ? (
                <>
                  <a
                    className="button"
                    href={`https://wa.me/${s.phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hello, I’d like to enquire about ${params.get("enquiry") || "sweets and gifting"}.`)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Let’s talk on WhatsApp <ArrowUpRight size={17} />
                  </a>
                  <p>
                    <a href={`tel:${s.phone}`}>Call {s.phone}</a>
                  </p>
                </>
              ) : (
                <p className="notice">
                  You’re welcome to visit us at the address above. Phone details
                  will be published once confirmed.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
export function Policies() {
  const { content } = useStoreContent();
  return (
    <div className="section article">
      <span className="eyebrow">THE HELPFUL DETAILS</span>
      <h1>A little clarity.</h1>
      {content.settings.policies.length ? (
        content.settings.policies.map((p) => (
          <section key={p.title}>
            <h2>{p.title}</h2>
            <p style={{ whiteSpace: "pre-line" }}>{p.body}</p>
          </section>
        ))
      ) : (
        <p>
          {isDemo
            ? "This is a demonstration storefront. No real orders or payments are taken."
            : "Store policies are being prepared. Online ordering will open after they are published."}
        </p>
      )}
      <h2>Your browsing data</h2>
      <p>
        Your bag is stored on this device. Signing in enables your bag and
        addresses to be saved to your account. Session cookies are HttpOnly.
        Order details are processed by the shop’s backend for fulfilment.
      </p>
    </div>
  );
}
