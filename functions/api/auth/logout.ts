import { db } from "../../../server/supabase";
import { endpoint, originGuard, response } from "../../../server/http";
import { cookieValue, sessionCookies } from "../../../server/auth";
export const onRequestPost = endpoint(async (ctx) => {
  originGuard(ctx);
  const token = cookieValue(ctx.request, "bapi_access");
  if (token) await db(ctx.env).auth.admin.signOut(token, "local");
  const res = response({ signedOut: true });
  for (const cookie of sessionCookies(ctx.request, null))
    res.headers.append("Set-Cookie", cookie);
  return res;
});
