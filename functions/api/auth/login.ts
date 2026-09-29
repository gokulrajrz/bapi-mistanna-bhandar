import { z } from "zod";
import { db } from "../../../server/supabase";
import {
  endpoint,
  originGuard,
  body,
  response,
  HttpError,
  throttle,
  sha256,
} from "../../../server/http";
export const onRequestPost = endpoint(async (ctx) => {
  originGuard(ctx);
  const input = await body(
    ctx.request,
    z.object({ email: z.email().max(254) }),
  );
  await throttle(ctx, "auth-login", 5);
  const email = input.email.toLowerCase();
  const c = db(ctx.env);
  const limit = await c.rpc("consume_rate_limit", {
    bucket: `email:${await sha256(email)}`,
    max_requests: 2,
  });
  if (limit.error || !limit.data)
    throw new HttpError(429, "Please wait before requesting another code.");
  const { error } = await c.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error)
    throw new HttpError(
      503,
      "Unable to send a sign-in code. Please try again later.",
    );
  return response({ sent: true });
});
