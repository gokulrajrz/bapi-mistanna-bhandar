import { db, type Context } from "./supabase";
import { actor, HttpError, rpcError } from "./http";
export async function admin(ctx: Context) {
  const who = await actor(ctx, true);
  const { data, error } = await db(ctx.env)
    .from("admin_users")
    .select("role")
    .eq("user_id", who.userId!)
    .maybeSingle();
  rpcError(error);
  if (!data) throw new HttpError(403, "Administrator access required.");
  return { ...who, role: data.role };
}
