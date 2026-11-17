import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useStoreContent } from "../lib/content";
import { api } from "../lib/request";
import { isDemo } from "../lib/api";
import { config } from "../lib/config";
import { seedProducts } from "../data/products";
export type Metadata = {
  title: string;
  description: string;
  image: string;
  url: string;
  schemas: unknown[];
  index: boolean;
  status: number;
};
export function applyMetadata(meta: Metadata, favicon: string) {
  document.title = meta.title;
  const set = (
    selector: string,
    tag: string,
    attrs: Record<string, string>,
  ) => {
    let el = document.head.querySelector(selector);
    if (!el) {
      el = document.createElement(tag);
      document.head.append(el);
    }
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  };
  set('meta[name="description"]', "meta", {
    name: "description",
    content: meta.description,
  });
  set('meta[name="robots"]', "meta", {
    name: "robots",
    content: meta.index ? "index, follow" : "noindex, nofollow",
  });
  set('link[rel="canonical"]', "link", { rel: "canonical", href: meta.url });
  set('link[rel="icon"]', "link", { rel: "icon", href: favicon });
  for (const [key, value] of Object.entries({
    title: meta.title,
    description: meta.description,
    image: meta.image,
    url: meta.url,
    type: "website",
  }))
    set(`meta[property="og:${key}"]`, "meta", {
      property: `og:${key}`,
      content: value,
    });
  document.head
    .querySelectorAll('script[type="application/ld+json"]')
    .forEach((el) => el.remove());
  const schema = document.createElement("script");
  schema.type = "application/ld+json";
  schema.textContent = JSON.stringify(meta.schemas).replaceAll("<", "\\u003c");
  document.head.append(schema);
}
export function PageMeta() {
  const { pathname } = useLocation(),
    { content } = useStoreContent();
  const privatePage = /^\/(admin|account|checkout|orders)(\/|$)/.test(pathname);
  const query = useQuery({
    queryKey: ["metadata", pathname],
    enabled: !privatePage,
    queryFn: ({ signal }) =>
      api<Metadata>(`/api/metadata?path=${encodeURIComponent(pathname)}`, {
        signal,
      }),
    staleTime: 30000,
    ...(isDemo
      ? {
          queryFn: async () => {
            const product = seedProducts.find(
                (p) => `/products/${p.slug}` === pathname,
              ),
              post = content.posts.find(
                (p) => `/journal/${p.slug}` === pathname,
              );
            return {
              title: `${product?.name || post?.title || (pathname === "/" ? "The taste of Assam" : pathname.split("/").at(-1)?.replaceAll("-", " "))} | ${content.settings.name}`,
              description:
                product?.description ||
                post?.body.join(" ").slice(0, 160) ||
                content.storefront.seoDescription,
              image: new URL(content.storefront.socialImage, config.site).href,
              url: config.site + pathname,
              schemas: [],
              index: false,
              status: 200,
            };
          },
        }
      : {}),
  });
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  useEffect(() => {
    if (query.data && !privatePage)
      applyMetadata(query.data, content.storefront.favicon);
    else
      applyMetadata(
        {
          title: content.settings.name,
          description: content.storefront.seoDescription,
          image: new URL(content.storefront.socialImage, config.site).href,
          url: config.site + pathname,
          schemas: [],
          index: false,
          status: 200,
        },
        content.storefront.favicon,
      );
  }, [
    pathname,
    query.data,
    privatePage,
    content.settings.name,
    content.storefront,
  ]);
  return null;
}
