import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { loadEnv } from "vite";
import { seedProducts } from "../src/data/products";
const env = { ...loadEnv("production", process.cwd(), ""), ...process.env };
const origin = (env.VITE_SITE_URL || "https://example.com").replace(/\/$/, "");
const name = env.VITE_SHOP_NAME || "Bapi Mistanna Bhandar";
const escape = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
const template = readFileSync("dist/index.html", "utf8");
const pages = [
  [
    "/",
    "The taste of Assam",
    "Discover Assamese specialties, handcrafted mithai and thoughtful gifting.",
  ],
  [
    "/shop",
    "Shop sweets",
    "Explore the Bapi Mistanna Bhandar sweet collection.",
  ],
  [
    "/gifts",
    "Thoughtful gifting",
    "Personal, wedding, corporate and festival mithai gifts.",
  ],
  [
    "/build-a-box",
    "Build your mithai box",
    "Choose your favourite sweets and create a thoughtful gift box.",
  ],
  ["/story", "Our story", "Rooted in Assam. Made for sharing."],
  [
    "/journal",
    "The sweet journal",
    "Stories of Assamese food, culture and craft.",
  ],
  ["/store", "Visit us", "Find Bapi Mistanna Bhandar in Assam."],
  [
    "/policies",
    "Delivery and policies",
    "Delivery, pickup, freshness and order support.",
  ],
  [
    "/journal/a-taste-of-bihu",
    "Bihu, and the sweetness of coming home.",
    "Discover pitha and laru and the shared table of Bihu.",
  ],
  [
    "/journal/the-art-of-slow",
    "Good things take their own sweet time.",
    "The patience and craft behind familiar mithai.",
  ],
  [
    "/journal/a-thoughtful-gift",
    "A little thought goes a long way.",
    "A thoughtful guide to gifting something sweet.",
  ],
  ...seedProducts.map((p) => [`/products/${p.slug}`, p.name, p.description]),
];
for (const [path, title, description] of pages) {
  const product = seedProducts.find((p) => path === `/products/${p.slug}`);
  const schema: unknown[] = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name,
      url: origin,
      logo: origin + "/favicon.svg",
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: origin },
        { "@type": "ListItem", position: 2, name: title, item: origin + path },
      ],
    },
  ];
  if (product && env.VITE_DEMO_MODE === "false")
    schema.push({
      "@context": "https://schema.org",
      "@type": "Product",
      name: product.name,
      description: product.description,
      image: origin + "/images/hero.webp",
      sku: product.id,
      brand: { "@type": "Brand", name },
    });
  if (path === "/store" && env.VITE_STORE_ADDRESS)
    schema.push({
      "@context": "https://schema.org",
      "@type": "Store",
      name,
      address: env.VITE_STORE_ADDRESS,
      telephone: env.VITE_STORE_PHONE,
      url: origin + "/store",
    });
  const metadata = `<meta name="description" content="${escape(description)}"/><link rel="canonical" href="${escape(origin + path)}"/><meta property="og:title" content="${escape(title + " | " + name)}"/><meta property="og:description" content="${escape(description)}"/><meta property="og:type" content="${product ? "product" : "website"}"/><meta property="og:url" content="${escape(origin + path)}"/><meta property="og:image" content="${escape(origin)}/images/hero.webp"/><script type="application/ld+json">${JSON.stringify(schema).replaceAll("<", "\\u003c")}</script>${env.VITE_DEMO_MODE !== "false" ? '<meta name="robots" content="noindex,nofollow"/>' : ""}`;
  const html = template
    .replace(
      /<title>.*?<\/title>/,
      `<title>${escape(title + " | " + name)}</title>`,
    )
    .replace(/<meta name="description"[^>]*\/>/, "")
    .replace("</head>", metadata + "</head>");
  const directory = "dist" + (path === "/" ? "" : path);
  mkdirSync(directory, { recursive: true });
  writeFileSync(directory + "/index.html", html);
}
writeFileSync(
  "dist/sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.map(([path]) => `<url><loc>${escape(origin + path)}</loc></url>`).join("")}</urlset>`,
);
writeFileSync(
  "dist/robots.txt",
  env.VITE_DEMO_MODE === "false"
    ? `User-agent: *\nAllow: /\nDisallow: /checkout\nDisallow: /api/\nSitemap: ${origin}/sitemap.xml\n`
    : "User-agent: *\nDisallow: /\n",
);
