import { db, type Env } from "./supabase";
import { rpcError } from "./http";
export const escapeHtml = (v: string) =>
  v
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
export async function pageMetadata(env: Env, pathname: string) {
  const c = db(env);
  const settings = await c
    .from("settings")
    .select("key,value")
    .in("key", ["public", "storefront"]);
  rpcError(settings.error);
  const values = Object.fromEntries(
    (settings.data || []).map((s) => [s.key, s.value]),
  );
  const brand = values.public,
    style = values.storefront;
  const origin = (
    env.SITE_URL ||
    env.ALLOWED_ORIGIN ||
    "https://example.com"
  ).replace(/\/$/, "");
  let title =
    pathname === "/"
      ? "The taste of Assam"
      : pathname.split("/").filter(Boolean).at(-1)?.replaceAll("-", " ") ||
        brand.name;
  let description = style.seoDescription;
  let image = style.socialImage;
  const schemas: unknown[] = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: brand.name,
      url: origin,
    },
  ];
  let status = 200;
  if (pathname.startsWith("/products/")) {
    const slug = pathname.split("/")[2];
    const { data, error } = await c
      .from("products")
      .select("data,product_variants(id,label,price,stock,active,sort_order)")
      .eq("slug", slug)
      .eq("active", true)
      .maybeSingle();
    rpcError(error);
    if (!data) status = 404;
    else {
      const p = data.data;
      const variants = data.product_variants
        .filter((v) => v.active)
        .sort(
          (a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id),
        );
      title = p.name;
      description = p.description;
      image = /\/images\/sweets?[-.]/.test(p.image || "")
        ? style.socialImage
        : p.image;
      schemas.push({
        "@context": "https://schema.org",
        "@type": "Product",
        name: p.name,
        description: p.description,
        image: new URL(image, origin).href,
        sku: p.id,
        brand: { "@type": "Brand", name: brand.name },
        offers: variants.map((v) => ({
          "@type": "Offer",
          name: v.label,
          sku: v.id,
          price: v.price,
          priceCurrency: "INR",
          availability: `https://schema.org/${v.stock > 0 ? "InStock" : "OutOfStock"}`,
          url: origin + pathname,
          itemCondition: "https://schema.org/NewCondition",
        })),
      });
    }
  }
  if (pathname.startsWith("/journal/")) {
    const { data, error } = await c
      .from("blog_posts")
      .select("slug,title,body,data")
      .eq("slug", pathname.split("/")[2])
      .eq("published", true)
      .maybeSingle();
    rpcError(error);
    if (!data) status = 404;
    else {
      title = data.title;
      description = data.body.slice(0, 160);
      image = data.data.image || image;
      schemas.push({
        "@context": "https://schema.org",
        "@type": "Article",
        headline: title,
        description,
        image: new URL(image, origin).href,
        author: { "@type": "Organization", name: brand.name },
      });
    }
  }
  if (pathname === "/store" && brand.address)
    schemas.push({
      "@context": "https://schema.org",
      "@type": "Store",
      name: brand.name,
      address: brand.address,
      telephone: brand.phone || undefined,
      url: origin + "/store",
    });
  if (pathname !== "/")
    schemas.push({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: origin },
        {
          "@type": "ListItem",
          position: 2,
          name: title,
          item: origin + pathname,
        },
      ],
    });
  return {
    title: `${title} | ${brand.name}`,
    description,
    image: new URL(image || "/images/hero.webp", origin).href,
    url: origin + pathname,
    schemas,
    status,
    index: brand.launchApproved && status === 200,
  };
}
