import { z } from "zod";
import { db } from "../../../server/supabase";
import {
  endpoint,
  originGuard,
  body,
  response,
  HttpError,
  throttle,
  rpcError,
} from "../../../server/http";
import { sessionCookies } from "../../../server/auth";
export const onRequestPost = endpoint(async (ctx) => {
  originGuard(ctx);
  await throttle(ctx, "auth-verify", 8);
  const input = await body(
    ctx.request,
    z.object({
      email: z.email().max(254),
      token: z.string().regex(/^\d{6,8}$/),
    }),
  );
  const { data, error } = await db(ctx.env).auth.verifyOtp({
    email: input.email.toLowerCase(),
    token: input.token,
    type: "email",
  });
  if (error || !data.session)
    throw new HttpError(
      400,
      "That code is invalid or expired. Please request a new one.",
    );
  const profile = await db(ctx.env)
    .from("customer_profiles")
    .upsert(
      { user_id: data.user!.id },
      { onConflict: "user_id", ignoreDuplicates: true },
    );
  rpcError(profile.error);
  const res = response({ signedIn: true });
  for (const cookie of sessionCookies(ctx.request, data.session))
    res.headers.append("Set-Cookie", cookie);
  return res;
});
