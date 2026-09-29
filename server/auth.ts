import type { Session } from "@supabase/supabase-js";
import { db, type Context } from "./supabase";
export function cookieValue(request: Request, name: string) {
  return request.headers
    .get("Cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}
export function sessionCookies(request: Request, session: Session | null) {
  const suffix = `; Path=/; HttpOnly; SameSite=Lax${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
  return [
    `bapi_access=${session?.access_token || ""}; Max-Age=${session?.expires_in || 0}${suffix}`,
    `bapi_refresh=${session?.refresh_token || ""}; Max-Age=${session ? 2592000 : 0}${suffix}`,
  ];
}
export async function sessionUser(ctx: Context) {
  const access = cookieValue(ctx.request, "bapi_access");
  const refresh = cookieValue(ctx.request, "bapi_refresh");
  if (!access && !refresh) return { user: null, cookies: [] as string[] };
  const auth = db(ctx.env).auth;
  if (access) {
    const { data, error } = await auth.getUser(access);
    if (!error && data.user)
      return { user: data.user, cookies: [] as string[] };
  }
  if (refresh) {
    const { data, error } = await auth.refreshSession({
      refresh_token: refresh,
    });
    if (!error && data.session && data.user)
      return {
        user: data.user,
        cookies: sessionCookies(ctx.request, data.session),
      };
  }
  return { user: null, cookies: sessionCookies(ctx.request, null) };
}
