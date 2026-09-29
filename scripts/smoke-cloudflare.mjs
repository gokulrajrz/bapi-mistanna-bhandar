import assert from "node:assert/strict";
const origin = process.env.SMOKE_ORIGIN || "http://localhost:8791";
for (const path of ["/", "/shop", "/products/kaju-katli", "/checkout"]) {
  const response = await fetch(origin + path);
  assert.equal(response.status, 200, path);
  assert.match(response.headers.get("Content-Security-Policy") || "", /frame-ancestors 'none'/);
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.match(await response.text(), /Bapi Mistanna Bhandar/, path);
}
const checkout = await fetch(origin + "/api/checkout", {
  method: "POST",
  headers: { Origin: origin, "Content-Type": "application/json" },
  body: "{}",
});
assert.equal(checkout.status, 503);
assert.match((await checkout.json()).error, /not open/);
const rejected = await fetch(origin + "/api/checkout", {
  method: "POST",
  headers: {
    Origin: "https://untrusted.example",
    "Content-Type": "application/json",
  },
  body: "{}",
});
assert.equal(rejected.status, 403);
const sitemap = await fetch(origin + "/sitemap.xml");
assert.equal(sitemap.status, 200);
assert.match(await sitemap.text(), /<urlset/);
const robots = await fetch(origin + "/robots.txt");
assert.match(await robots.text(), /Disallow: \//);
const admin = await fetch(origin + "/api/admin/orders");
assert.equal(admin.status, 401);
console.log(
  "Cloudflare runtime smoke checks passed: static routes, product deep link, SPA fallback, BFF gate, origin validation, sitemap.",
);
