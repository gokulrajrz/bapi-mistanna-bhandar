import { demoArticles } from "../src/data/content";
import { writeFileSync } from "node:fs";
import { seedProducts } from "../src/data/products";
const quote = (v: unknown) => "'" + String(v).replaceAll("'", "''") + "'";
let sql =
  "-- DEMO catalogue only. Review every product before enabling live orders.\n";
for (const [index, p] of seedProducts.entries()) {
  sql += `insert into public.products(id,slug,data,active,sort_order) values (${quote(p.id)},${quote(p.slug)},${quote(JSON.stringify(p))}::jsonb,true,${index}) on conflict(id) do update set data=excluded.data;\n`;
  for (const [index, v] of p.variants.entries())
    sql += `insert into public.product_variants(id,product_id,label,price,stock,sort_order) values (${quote(v.id)},${quote(p.id)},${quote(v.label)},${v.price},${v.stock},${index}) on conflict(id) do nothing;\n`;
  sql += `insert into public.inventory(product_id,piece_price,pieces) values (${quote(p.id)},${p.piecePrice},200) on conflict(product_id) do nothing;\n`;
}
sql +=
  "insert into public.coupons(code,percent,max_discount,active) values ('SWEET10',10,200,false) on conflict do nothing;\n";
for (const post of demoArticles)
  sql += `insert into public.blog_posts(slug,title,body,data,published) values(${quote(post.slug)},${quote(post.title)},${quote(post.body.join("\n\n"))},${quote(JSON.stringify({ tag: post.tag, image: post.image }))}::jsonb,true) on conflict(slug) do nothing;\n`;
writeFileSync("supabase/seed.sql", sql);
