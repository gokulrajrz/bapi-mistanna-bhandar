import type { Context } from "../server/supabase";
export function onRequestGet({ request, env }: Context) {
  const live = env.DEMO_MODE === "false";
  return new Response(
    live
      ? `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin\nDisallow: /account\nDisallow: /checkout\nDisallow: /orders/\nSitemap: ${(env.SITE_URL || new URL(request.url).origin).replace(/\/$/, "")}/sitemap.xml\n`
      : "User-agent: *\nDisallow: /\n",
    {
      headers: {
        "Content-Type": "text/plain",
        "Cache-Control": "public, max-age=60",
      },
    },
  );
}
