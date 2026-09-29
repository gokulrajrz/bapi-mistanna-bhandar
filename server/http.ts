import { sessionUser } from "./auth";
import { z } from "zod";
import { db, json, type Context } from "./supabase";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function readBody(request: Request, limit = 32768) {
  if (Number(request.headers.get("content-length") || 0) > limit)
    throw new HttpError(413, "The request is too large.");
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new HttpError(413, "The request is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(bytes);
}
export async function body<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new HttpError(415, "Expected a JSON request.");
  let value;
  try {
    value = JSON.parse(await readBody(request));
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, "The request is not valid JSON.");
  }
  const result = schema.safeParse(value);
  if (!result.success)
    throw new HttpError(
      400,
      result.error.issues[0]?.message || "Check your details.",
    );
  return result.data;
}
export function originGuard({ request, env }: Context) {
  if (
    request.headers.get("Origin") !==
    (env.ALLOWED_ORIGIN || new URL(request.url).origin)
  )
    throw new HttpError(403, "This request origin is not allowed.");
}
export async function sha256(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (v) => v.toString(16).padStart(2, "0"),
  ).join("");
}
export async function actor(ctx: Context, required = false) {
  const session = await sessionUser(ctx);
  const userId = session.user?.id || null;
  const email = session.user?.email;
  if (required && !userId)
    throw new HttpError(401, "Please sign in to continue.");
  const cookie = ctx.request.headers
    .get("Cookie")
    ?.match(/(?:^|;\s*)bapi_guest=([a-f0-9]{64})(?:;|$)/)?.[1];
  const guest =
    cookie ||
    Array.from(crypto.getRandomValues(new Uint8Array(32)), (v) =>
      v.toString(16).padStart(2, "0"),
    ).join("");
  return {
    userId,
    email,
    authCookies: session.cookies,
    guestHash: await sha256(guest),
    cookie: cookie
      ? undefined
      : `bapi_guest=${guest}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${new URL(ctx.request.url).protocol === "https:" ? "; Secure" : ""}`,
  };
}
export type Actor = Awaited<ReturnType<typeof actor>>;
export function response(data: unknown, who?: Actor, status = 200) {
  const res = json(data, status);
  if (who?.cookie) res.headers.append("Set-Cookie", who.cookie);
  for (const cookie of who?.authCookies || [])
    res.headers.append("Set-Cookie", cookie);
  return res;
}
export function rpcError(error: { code?: string; message: string } | null) {
  if (error)
    throw new HttpError(
      error.code === "P0001" ? 409 : 503,
      error.code === "P0001"
        ? error.message
        : "The store could not complete this request. Please try again.",
    );
}
export function endpoint(fn: (ctx: Context) => Promise<Response>) {
  return async (ctx: Context) => {
    const id = crypto.randomUUID();
    try {
      const res = await fn(ctx);
      res.headers.set("X-Request-Id", id);
      return res;
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 503;
      if (status >= 500)
        console.error(
          JSON.stringify({
            requestId: id,
            path: new URL(ctx.request.url).pathname,
            status,
            error: e instanceof HttpError ? e.message : "unexpected_error",
          }),
        );
      const res = json(
        {
          error:
            e instanceof HttpError
              ? e.message
              : "Something went wrong. Please try again.",
          requestId: id,
        },
        status,
      );
      res.headers.set("X-Request-Id", id);
      return res;
    }
  };
}
export async function throttle(ctx: Context, scope: string, limit = 30) {
  const key = await sha256(
    `${scope}:${ctx.request.headers.get("CF-Connecting-IP") || "local"}`,
  );
  const { data, error } = await db(ctx.env).rpc("consume_rate_limit", {
    bucket: key,
    max_requests: limit,
  });
  rpcError(error);
  if (!data)
    throw new HttpError(
      429,
      "Too many requests. Please wait a minute and try again.",
    );
}
export async function ownedOrder(ctx: Context, who: Actor, id: string) {
  if (!z.uuid().safeParse(id).success)
    throw new HttpError(404, "Order not found.");
  const client = db(ctx.env);
  let q = client.from("orders").select("*").eq("id", id);
  q = who.userId
    ? q.or(`user_id.eq.${who.userId},guest_hash.eq.${who.guestHash}`)
    : q.eq("guest_hash", who.guestHash);
  const { data, error } = await q.maybeSingle();
  rpcError(error);
  if (!data) throw new HttpError(404, "Order not found.");
  return data;
}
