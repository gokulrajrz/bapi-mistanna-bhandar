import { db } from "../../../server/supabase";
import { endpoint, actor, response, rpcError } from "../../../server/http";
export const onRequestGet = endpoint(async (ctx) => {
  const who = await actor(ctx);
  let role = null;
  if (who.userId) {
    const result = await db(ctx.env)
      .from("admin_users")
      .select("role")
      .eq("user_id", who.userId)
      .maybeSingle();
    rpcError(result.error);
    role = result.data?.role || null;
  }
  return response(
    { user: who.userId ? { id: who.userId, email: who.email } : null, role },
    who,
  );
});
