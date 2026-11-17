import { z } from "zod";
import { db } from "../../../../server/supabase";
import { admin } from "../../../../server/admin";
import {
  endpoint,
  response,
  rpcError,
  HttpError,
} from "../../../../server/http";
export const onRequestGet = endpoint(async (ctx) => {
  const who = await admin(ctx),
    id = z.uuid().parse(ctx.params.id),
    c = db(ctx.env);
  const page = Math.max(
    1,
    Math.min(
      100000,
      Math.floor(
        Number(new URL(ctx.request.url).searchParams.get("page")) || 1,
      ),
    ),
  );
  const [profile, addresses, orders] = await Promise.all([
    c.from("customer_profiles").select("*").eq("user_id", id).maybeSingle(),
    c.from("addresses").select("id,label,data").eq("user_id", id),
    c
      .from("orders")
      .select("id,total,status,created_at", { count: "exact" })
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range((page - 1) * 50, page * 50 - 1),
  ]);
  for (const r of [profile, addresses, orders]) rpcError(r.error);
  if (!profile.data) throw new HttpError(404, "Customer not found.");
  return response(
    {
      profile: profile.data,
      addresses: addresses.data,
      orders: orders.data,
      ordersTotal: orders.count || 0,
      page,
    },
    who,
  );
});
