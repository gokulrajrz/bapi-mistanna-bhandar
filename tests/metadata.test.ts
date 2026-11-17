// @vitest-environment jsdom
import { expect, it } from "vitest";
import { applyMetadata } from "../src/components/PageMeta";
it("replaces product metadata completely during navigation and removes stale schema", () => {
  const first = {
    title: "Kaju Katli | Bapi",
    description: "Cashew sweet",
    url: "https://shop.test/products/kaju-katli",
    image: "https://shop.test/kaju.webp",
    schemas: [{ "@type": "Product", name: "Kaju Katli" }],
    index: true,
    status: 200,
  };
  applyMetadata(first, "/favicon.svg");
  applyMetadata(
    {
      ...first,
      title: "Our journal | Bapi",
      description: "Stories",
      url: "https://shop.test/journal",
      image: "https://shop.test/journal.webp",
      schemas: [{ "@type": "Organization" }],
    },
    "/new-icon.png",
  );
  expect(document.title).toBe("Our journal | Bapi");
  expect(
    document.querySelector('meta[name="description"]')?.getAttribute("content"),
  ).toBe("Stories");
  expect(
    document.querySelector('meta[property="og:url"]')?.getAttribute("content"),
  ).toBe("https://shop.test/journal");
  expect(
    document
      .querySelector('meta[property="og:image"]')
      ?.getAttribute("content"),
  ).toBe("https://shop.test/journal.webp");
  expect(
    document.querySelector('script[type="application/ld+json"]')?.textContent,
  ).not.toContain("Product");
  expect(document.querySelector('link[rel="icon"]')?.getAttribute("href")).toBe(
    "/new-icon.png",
  );
});
