import { useStoreContent } from "../lib/content";
import { Photo } from "../components/Photo";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  Flower2,
  Leaf,
  Gift,
  PackageCheck,
  Heart,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { productQueries } from "../lib/queries";
import { ProductCard } from "../components/ProductCard";
import {
  SectionHeading,
  ArrowLink,
  Loading,
  ErrorState,
} from "../components/ui";
export default function Home() {
  const { content } = useStoreContent();
  const view = content.storefront;
  const copy = view.home;
  const products = useQuery(
    productQueries.list({ featured: true, pageSize: 4 }),
  );
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow hero-eyebrow">
            <span /> {view.heroEyebrow}
          </div>
          <h1>
            {view.heroTitle}
            <br />
            <em>{view.heroAccent}</em>
          </h1>
          <p>{view.heroDescription}</p>
          <Link to={view.heroLink} className="button">
            {view.heroCta} <ArrowUpRight size={18} />
          </Link>
          <div className="hero-footnote">
            <span className="tiny-flower">✳</span> {copy.footnote}
          </div>
        </div>
        <div className="hero-image">
          <img
            src={view.heroImage}
            alt="An assortment of handcrafted Indian mithai on a brass platter with Assamese woven cloth"
            srcSet={
              view.heroImage === "/images/hero.webp"
                ? "/images/hero-small.webp 768w, /images/hero.webp 1536w"
                : undefined
            }
            sizes="(max-width: 540px) 100vw, 56vw"
            fetchPriority="high"
            width="1536"
            height="1024"
          />
          <div className="hero-stamp">
            <Flower2 size={27} strokeWidth={1} />
            <span>
              HANDCRAFTED
              <br />
              WITH HEART
            </span>
            <small>অসম · ASSAM</small>
          </div>
          <div className="image-caption">
            <span>THE ART OF SOMETHING SWEET</span>
            <span>ASSAM · INDIA</span>
          </div>
        </div>
        <span className="hero-side-label">TRADITION, ONE BITE AT A TIME</span>
      </section>
      <div className="promise-strip">
        <span>
          <Leaf /> {copy.promises[0]}
        </span>
        <span>
          <Heart /> {copy.promises[1]}
        </span>
        <span>
          <Gift /> {copy.promises[2]}
        </span>
        <span>
          <PackageCheck /> {copy.promises[3]}
        </span>
      </div>
      {view.sections.bestsellers && (
        <section className="section bestsellers">
          <SectionHeading
            eyebrow={copy.bestsellersEyebrow}
            title={copy.bestsellersTitle}
            link={{ to: "/shop", text: "Shop all sweets" }}
          />
          {products.isPending ? (
            <Loading />
          ) : products.isError ? (
            <ErrorState retry={() => products.refetch()} />
          ) : (
            <div className="product-grid">
              {products.data
                .filter((p) => p.featured)
                .map((p) => (
                  <ProductCard product={p} key={p.id} />
                ))}
            </div>
          )}
        </section>
      )}
      {view.sections.introduction && (
        <section className="intro-section">
          <div className="intro-symbol">
            <Flower2 size={70} strokeWidth={0.65} />
            <span>অসমৰ পৰা, মৰমেৰে</span>
          </div>
          <div>
            <span className="eyebrow">{copy.introductionEyebrow}</span>
            <h2>{copy.introductionTitle}</h2>
            <p>{copy.introductionBody}</p>
            <ArrowLink to="/story">Get to know our story</ArrowLink>
          </div>
          <div className="intro-image">
            <Photo
              src={copy.introductionImage}
              alt="Coconut laru, an Assamese favourite"
            />
            <span>{copy.introductionCaption}</span>
          </div>
        </section>
      )}
      {view.sections.occasions && (
        <section className="section occasions">
          <SectionHeading
            eyebrow={copy.occasionsEyebrow}
            title={copy.occasionsTitle}
          />
          <div className="occasion-grid">
            {copy.occasions.map((o, i) => (
              <Link
                className={`occasion-card occasion-${i}`}
                key={o.title}
                to={o.to}
              >
                <Photo src={o.image} alt={o.title} />
                <div>
                  <small>0{i + 1}</small>
                  <h3>{o.title}</h3>
                  <p>{o.sub}</p>
                  <ArrowUpRight size={23} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
      {view.sections.boxBuilder && (
        <section className="box-teaser">
          <div className="box-art">
            <div className="ribbon" />
            <div className="illustrated-box">
              <Flower2 size={45} strokeWidth={1} />
              <span>
                A LITTLE
                <br />
                BOX OF JOY
              </span>
              <small>FROM ASSAM, WITH LOVE</small>
            </div>
            <span className="box-art-caption">
              Thoughtfully picked. Beautifully packed.
            </span>
          </div>
          <div className="box-copy">
            <span className="eyebrow">{copy.boxEyebrow}</span>
            <h2>{copy.boxTitle}</h2>
            <p>{copy.boxDescription}</p>
            <Link className="button" to="/build-a-box">
              Build your box <ArrowUpRight size={18} />
            </Link>
            <span className="box-size-note">
              6, 12, 18 or 24 little reasons to smile.
            </span>
          </div>
        </section>
      )}
      {view.sections.journal && (
        <section className="section journal-preview">
          <SectionHeading
            eyebrow={copy.journalEyebrow}
            title={copy.journalTitle}
            link={{ to: "/journal", text: "A little reading" }}
          />
          <div className="journal-grid">
            {content.posts.slice(0, 2).map((post) => (
              <Link key={post.slug} to={`/journal/${post.slug}`}>
                <Photo src={post.image} alt={post.title} />
                <span className="eyebrow">{post.tag}</span>
                <h3>{post.title}</h3>
                <span className="text-link">
                  Read the story <ArrowRight size={16} />
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
      <section className="closing-note">
        <Flower2 size={30} strokeWidth={1} />
        <p>{copy.closing}</p>
        <ArrowLink to="/shop">Find your favourite</ArrowLink>
      </section>
    </>
  );
}
