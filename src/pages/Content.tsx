import { StorySequence } from "../components/StorySequence";
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
        <span className="eyebrow">{content.storefront.pages.storyEyebrow}</span>
        <h1>{content.storefront.storyTitle}</h1>
        <p>{content.storefront.pages.storySubtitle}</p>
        <Photo src={content.storefront.heroImage} alt="Mithai from Assam" />
      </section>
      <section className="story-body section">
        <Flower2 size={46} strokeWidth={1} />
        <h2>{content.storefront.pages.storySectionTitle}</h2>
        {content.storefront.storyParagraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
        <StorySequence
          steps={content.storefront.pages.makingSteps}
          motion={content.storefront.experience.storyMotion}
        />
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
        <span className="eyebrow">{content.storefront.pages.giftsEyebrow}</span>
        <h1>{content.storefront.giftsTitle}</h1>
        <p>{content.storefront.giftsDescription}</p>
      </div>
      <div className="gifting-hero">
        <Photo
          src={content.storefront.heroImage}
          alt="Mithai for thoughtful gifting"
        />
        <div>
          <span className="eyebrow">
            {content.storefront.pages.giftsFeatureEyebrow}
          </span>
          <h2>{content.storefront.pages.giftsFeatureTitle}</h2>
          <p>{content.storefront.pages.giftsFeatureDescription}</p>
          <Link className="button" to="/build-a-box">
            Make it personal <ArrowUpRight size={17} />
          </Link>
        </div>
      </div>
      <div className="gifting-types">
        {content.storefront.pages.giftingCards.map(
          ({ title, description, to, image }) => (
            <Link
              className={
                params.get("type") === title.toLowerCase() ? "selected" : ""
              }
              to={to}
              key={title}
            >
              <Photo src={image} alt={title} />
              <h2>{title}</h2>
              <p>{description}</p>
              <ArrowUpRight />
            </Link>
          ),
        )}
      </div>
    </div>
  );
}
export function Journal() {
  const { content } = useStoreContent();
  return (
    <div className="section">
      <div className="page-intro">
        <span className="eyebrow">
          {content.storefront.pages.journalEyebrow}
        </span>
        <h1>{content.storefront.pages.journalTitle}</h1>
        <p>{content.storefront.pages.journalDescription}</p>
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
