import { db } from "../../../../server/supabase";
import { admin } from "../../../../server/admin";
import {
  endpoint,
  response,
  rpcError,
  HttpError,
} from "../../../../server/http";
export const onRequestGet = endpoint(async (ctx) => {
  const who = await admin(ctx);
  const { data, error } = await db(ctx.env)
    .from("orders")
    .select(
      "id,contact,total,status,tracking,created_at,order_items(snapshot,quantity,unit_price),order_events(status,description,created_at)",
    )
    .eq("id", String(ctx.params.id))
    .maybeSingle();
  rpcError(error);
  if (!data) throw new HttpError(404, "Order not found.");
  return response(data, who);
});
