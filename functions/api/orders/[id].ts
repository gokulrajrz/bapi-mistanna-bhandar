import { db } from "../../../server/supabase";
import {
  endpoint,
  actor,
  ownedOrder,
  response,
  rpcError,
} from "../../../server/http";
export const onRequestGet = endpoint(async (ctx) => {
  const who = await actor(ctx);
  const order = await ownedOrder(ctx, who, String(ctx.params.id));
  const client = db(ctx.env);
  const [items, events] = await Promise.all([
    client
      .from("order_items")
      .select("snapshot,quantity,unit_price")
      .eq("order_id", order.id),
    client
      .from("order_events")
      .select("id,status,description,created_at")
      .eq("order_id", order.id)
      .order("created_at"),
  ]);
  rpcError(items.error);
  rpcError(events.error);
  return response(
    {
      id: order.id,
      total: order.total,
      subtotal: order.subtotal,
      shipping: order.shipping,
      discount: order.discount,
      status: order.status,
      createdAt: order.created_at,
      expiresAt: order.expires_at,
      contact: order.contact,
      tracking: order.tracking,
      items: items.data,
      events: events.data,
    },
    who,
  );
});
