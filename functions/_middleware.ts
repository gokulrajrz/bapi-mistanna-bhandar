import type { Context } from "../server/supabase";
import { pageMetadata, escapeHtml } from "../server/seo";
export async function onRequest(
  ctx: Context & { next: () => Promise<Response> },
) {
  const path = new URL(ctx.request.url).pathname;
  const res = await ctx.next();
  const headers = new Headers(res.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  headers.set(
    "Content-Security-Policy",
    "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' https://checkout.razorpay.com https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https: data:; connect-src 'self' https://api.razorpay.com https://lumberjack.razorpay.com https://challenges.cloudflare.com; frame-src https://api.razorpay.com https://checkout.razorpay.com https://challenges.cloudflare.com;",
  );
  const secured = new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
  if (
    path.startsWith("/api/") ||
    ctx.request.method !== "GET" ||
    !res.headers.get("content-type")?.includes("text/html")
  )
    return secured;
  if (/^\/(admin|account|checkout|orders)(\/|$)/.test(path)) {
    headers.set("X-Robots-Tag", "noindex, nofollow");
    headers.set("Cache-Control", "private, no-store");
    return new Response(secured.body, { status: secured.status, headers });
  }
  if (ctx.env.DEMO_MODE !== "false") {
    headers.set("X-Robots-Tag", "noindex, nofollow");
    return new Response(secured.body, { status: secured.status, headers });
  }
  try {
    const metadata = await pageMetadata(
      ctx.env,
      path.replace(/\/$/, "") || "/",
    );
    headers.set("Cache-Control", "public, max-age=0, s-maxage=30");
    if (!metadata.index) headers.set("X-Robots-Tag", "noindex, nofollow");
    const html = `<title>${escapeHtml(metadata.title)}</title><meta name="description" content="${escapeHtml(metadata.description)}"><link rel="canonical" href="${escapeHtml(metadata.url)}"><meta property="og:title" content="${escapeHtml(metadata.title)}"><meta property="og:description" content="${escapeHtml(metadata.description)}"><meta property="og:url" content="${escapeHtml(metadata.url)}"><meta property="og:image" content="${escapeHtml(metadata.image)}"><meta property="og:type" content="website"><script type="application/ld+json">${JSON.stringify(metadata.schemas).replaceAll("<", "\\u003c")}</script>`;
    return new HTMLRewriter()
      .on(
        'title,meta[name="description"],meta[property^="og:"],meta[name="robots"],link[rel="canonical"],script[type="application/ld+json"]',
        {
          element(el) {
            el.remove();
          },
        },
      )
      .on("head", {
        element(el) {
          el.append(html, { html: true });
        },
      })
      .transform(
        new Response(secured.body, { status: metadata.status, headers }),
      );
  } catch {
    headers.set("Cache-Control", "no-store");
    headers.set("Retry-After", "30");
    return new Response(
      "The store is temporarily unavailable. Please try again shortly.",
      { status: 503, headers },
    );
  }
}
