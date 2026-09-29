import { homeContent } from "../../shared/home-content";
import { db } from "../../server/supabase";
import { endpoint, response, rpcError } from "../../server/http";
export const onRequestGet = endpoint(async (ctx) => {
  const c = db(ctx.env);
  const results = await Promise.all([
    c
      .from("settings")
      .select("key,value")
      .in("key", ["public", "commerce", "storefront", "operations"]),
    c.from("collections").select("*").eq("active", true),
    c
      .from("festival_campaigns")
      .select("*")
      .eq("active", true)
      .lte("starts_at", new Date().toISOString())
      .gte("ends_at", new Date().toISOString()),
    c
      .from("blog_posts")
      .select("slug,title,body,data")
      .eq("published", true)
      .order("slug"),
    c.from("stores").select("*").eq("id", "main").maybeSingle(),
  ]);
  for (const r of results) rpcError(r.error);
  const [settings, collections, campaigns, posts, store] = results;
  const values = Object.fromEntries(
    (settings.data || []).map((s) => [s.key, s.value]),
  );
  const cats = await c
    .from("products")
    .select("data->>category")
    .eq("active", true);
  rpcError(cats.error);
  const res = response({
    storefront: {
      ...values.storefront,
      home: { ...homeContent, ...values.storefront.home },
    },
    operations: values.operations,
    categories: [...new Set((cats.data || []).map((v) => v.category))],
    settings: {
      ...values.public,
      address: store.data?.address || values.public.address,
      phone: store.data?.phone || values.public.phone,
      hours: store.data?.data?.hours || values.public.hours,
      pickupInstructions:
        store.data?.data?.pickupInstructions ||
        values.public.pickupInstructions,
    },
    commerce: {
      boxFee: values.commerce.boxFee,
      wrapFee: values.commerce.wrapFee,
      freeShipping: values.commerce.freeShipping,
      pickupEnabled: values.commerce.pickupEnabled,
    },
    collections: collections.data,
    campaigns: (campaigns.data || [])
      .map((x) => ({
        ...x,
        collection: collections.data?.find((c) => c.id === x.collection_id),
      }))
      .filter((x) => x.collection),
    posts: (posts.data || []).map((p) => ({
      slug: p.slug,
      title: p.title,
      body: p.body.split("\n\n"),
      ...p.data,
    })),
    store: store.data ? { ...store.data, ...store.data.data } : null,
    paymentEnabled:
      ctx.env.CHECKOUT_ENABLED === "true" &&
      values.operations.checkoutEnabled &&
      !!ctx.env.RAZORPAY_KEY_ID &&
      !!ctx.env.TURNSTILE_SECRET_KEY &&
      values.public.launchApproved,
    turnstileSiteKey: ctx.env.TURNSTILE_SITE_KEY || null,
  });
  res.headers.set("Cache-Control", "public, max-age=15, s-maxage=30");
  return res;
});
