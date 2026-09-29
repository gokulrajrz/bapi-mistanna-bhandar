import { db } from "../../../server/supabase";
import { endpoint, response, rpcError } from "../../../server/http";
export const onRequestGet = endpoint(async (ctx) => {
  const { data, error } = await db(ctx.env)
    .from("products")
    .select(
      "id,data,product_variants(id,label,price,stock,sort_order,active),inventory(piece_price,pieces)",
    )
    .eq("slug", String(ctx.params.slug))
    .eq("active", true)
    .maybeSingle();
  rpcError(error);
  const inventory = Array.isArray(data?.inventory)
    ? data.inventory[0]
    : data?.inventory;
  return response(
    data
      ? {
          ...data.data,
          variants: data.product_variants
            .filter((v) => v.active)
            .sort(
              (a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id),
            ),
          piecePrice: inventory?.piece_price ?? 0,
          pieceStock: inventory?.pieces ?? 0,
        }
      : null,
  );
});
