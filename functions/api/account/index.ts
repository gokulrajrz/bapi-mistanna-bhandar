import { z } from "zod";
import { db } from "../../../server/supabase";
import {
  endpoint,
  actor,
  originGuard,
  body,
  response,
  rpcError,
} from "../../../server/http";
export const onRequestGet = endpoint(async (ctx) => {
  const who = await actor(ctx, true);
  const c = db(ctx.env);
  const [profile, addresses, orders, cart] = await Promise.all([
    c
      .from("customer_profiles")
      .select("name,phone")
      .eq("user_id", who.userId!)
      .maybeSingle(),
    c
      .from("addresses")
      .select("id,label,data")
      .eq("user_id", who.userId!)
      .order("created_at"),
    c
      .from("orders")
      .select("id,total,status,created_at")
      .eq("user_id", who.userId!)
      .order("created_at", { ascending: false })
      .limit(100),
    c
      .from("customer_carts")
      .select("items,revision")
      .eq("user_id", who.userId!)
      .maybeSingle(),
  ]);
  for (const r of [profile, addresses, orders, cart]) rpcError(r.error);
  return response(
    {
      userId: who.userId,
      email: who.email,
      profile: profile.data || { name: "", phone: "" },
      addresses: (addresses.data || []).map((a) => ({
        id: a.id,
        label: a.label,
        ...a.data,
      })),
      orders: orders.data,
      cart: cart.data || { items: [], revision: 1 },
    },
    who,
  );
});
export const onRequestPatch = endpoint(async (ctx) => {
  originGuard(ctx);
  const who = await actor(ctx, true);
  const input = await body(
    ctx.request,
    z.object({
      name: z.string().trim().min(2).max(100),
      phone: z.string().regex(/^[6-9]\d{9}$/),
    }),
  );
  const { error } = await db(ctx.env)
    .from("customer_profiles")
    .upsert({
      user_id: who.userId,
      ...input,
      updated_at: new Date().toISOString(),
    });
  rpcError(error);
  return response(input, who);
});
