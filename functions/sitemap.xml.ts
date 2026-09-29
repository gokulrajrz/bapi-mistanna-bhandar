import { db } from "../server/supabase";
import { endpoint, rpcError } from "../server/http";
import { escapeHtml } from "../server/seo";
export const onRequestGet = endpoint(async (ctx) => {
  if (ctx.env.DEMO_MODE !== "false")
    return new Response(
      '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>',
      {
        headers: {
          "Content-Type": "application/xml",
          "X-Robots-Tag": "noindex",
        },
      },
    );
  const c = db(ctx.env);
  const origin = (ctx.env.SITE_URL || new URL(ctx.request.url).origin).replace(
    /\/$/,
    "",
  );
  const paths = [
    "/",
    "/shop",
    "/gifts",
    "/build-a-box",
    "/story",
    "/journal",
    "/store",
    "/policies",
  ];
  for (const table of ["products", "blog_posts"]) {
    for (let page = 0; ; page++) {
      const { data, error } = await c
        .from(table)
        .select("slug")
        .eq(table === "products" ? "active" : "published", true)
        .order("slug")
        .range(page * 500, page * 500 + 499);
      rpcError(error);
      for (const row of data || [])
        paths.push(
          `/${table === "products" ? "products" : "journal"}/${row.slug}`,
        );
      if ((data?.length || 0) < 500) break;
    }
  }
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((p) => `<url><loc>${escapeHtml(origin + p)}</loc></url>`).join("")}</urlset>`,
    {
      headers: {
        "Content-Type": "application/xml",
        "Cache-Control": "public, max-age=0, s-maxage=60",
      },
    },
  );
});
