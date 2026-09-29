import { z } from "zod";
import { db } from "../../../server/supabase";
import { addressSchema } from "../../../shared/validation";
import {
  endpoint,
  actor,
  originGuard,
  body,
  response,
  rpcError,
  HttpError,
} from "../../../server/http";
export const onRequestPost = endpoint(async (ctx) => {
  originGuard(ctx);
  const who = await actor(ctx, true);
  const { id, label, ...data } = await body(ctx.request, addressSchema);
  const c = db(ctx.env);
  if (id) {
    const { data: row, error } = await c
      .from("addresses")
      .update({ label, data })
      .eq("id", id)
      .eq("user_id", who.userId!)
      .select("id")
      .maybeSingle();
    rpcError(error);
    if (!row) throw new HttpError(404, "Address not found.");
    return response({ id, label, ...data }, who);
  }
  const count = await c
    .from("addresses")
    .select("id", { count: "exact", head: true })
    .eq("user_id", who.userId!);
  rpcError(count.error);
  if ((count.count || 0) >= 10)
    throw new HttpError(409, "You can save up to ten addresses.");
  const { data: row, error } = await c
    .from("addresses")
    .insert({ user_id: who.userId, label, data })
    .select("id")
    .single();
  rpcError(error);
  return response({ id: row!.id, label, ...data }, who, 201);
});
export const onRequestDelete = endpoint(async (ctx) => {
  originGuard(ctx);
  const who = await actor(ctx, true);
  const input = await body(ctx.request, z.object({ id: z.uuid() }));
  const { error } = await db(ctx.env)
    .from("addresses")
    .delete()
    .eq("id", input.id)
    .eq("user_id", who.userId!);
  rpcError(error);
  return response({ deleted: true }, who);
});
