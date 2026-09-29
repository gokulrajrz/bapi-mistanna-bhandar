import { homeContent } from "../../../shared/home-content";
import { z } from "zod";
import { db } from "../../../server/supabase";
import { admin } from "../../../server/admin";
import {
  resourceSchemas,
  settingsSchemas,
  type AdminResource,
} from "../../../shared/admin-schema";
import {
  endpoint,
  response,
  body,
  originGuard,
  rpcError,
  HttpError,
  throttle,
} from "../../../server/http";
const resources = new Set([
  ...Object.keys(resourceSchemas),
  "settings",
  "refund_jobs",
  "admin_audit",
]);
export const onRequestGet = endpoint(async (ctx) => {
  const who = await admin(ctx);
  const resource = String(ctx.params.resource);
  if (!resources.has(resource)) throw new HttpError(404, "Resource not found.");
  if (
    ["settings", "admin_users", "admin_audit"].includes(resource) &&
    who.role !== "owner"
  )
    throw new HttpError(403, "Owner access required.");
  let q = db(ctx.env)
    .from(resource)
    .select(
      resource === "products" ? "*,product_variants(*),inventory(*)" : "*",
      { count: "exact" },
    );
  const page = Math.max(
    1,
    Number(new URL(ctx.request.url).searchParams.get("page")) || 1,
  );
  q = q
    .range((page - 1) * 50, page * 50 - 1)
    .order(
      resource === "products"
        ? "sort_order"
        : resource === "settings"
          ? "key"
          : resource === "admin_users"
            ? "user_id"
            : resource === "coupons"
              ? "code"
              : resource === "blog_posts"
                ? "slug"
                : "id",
    );
  const { data, error, count } = await q;
  rpcError(error);
  if (resource === "settings")
    for (const row of (data || []) as unknown as {
      key: string;
      value: Record<string, unknown> & { home?: object };
    }[])
      if (row.key === "storefront")
        row.value = {
          ...row.value,
          home: { ...homeContent, ...row.value.home },
        };
  return response({ items: data, total: count, page, pageSize: 50 }, who);
});
export const onRequestPut = endpoint(async (ctx) => {
  originGuard(ctx);
  await throttle(ctx, "admin-write", 60);
  const who = await admin(ctx);
  const resource = String(ctx.params.resource);
  let document: unknown;
  if (resource === "settings") {
    if (who.role !== "owner")
      throw new HttpError(403, "Owner access required.");
    const input = await body(
      ctx.request,
      z.object({
        key: z.enum(["public", "commerce", "storefront", "operations"]),
        value: z.unknown(),
      }),
    );
    const parsed = settingsSchemas[input.key].safeParse(input.value);
    if (!parsed.success)
      throw new HttpError(400, parsed.error.issues[0].message);
    document = { key: input.key, value: parsed.data };
    if (
      input.key === "public" &&
      (parsed.data as { launchApproved?: boolean }).launchApproved
    ) {
      const p = parsed.data as {
        address: string;
        phone: string;
        hours: string;
        policies: unknown[];
      };
      if (!p.address || !p.phone || !p.hours || p.policies.length < 3)
        throw new HttpError(
          400,
          "Publish your address, phone, hours, and delivery/refund/privacy policies before approving launch.",
        );
    }
  } else if (resource in resourceSchemas) {
    if (resource === "admin_users" && who.role !== "owner")
      throw new HttpError(403, "Owner access required.");
    document = await body(
      ctx.request,
      resourceSchemas[resource as AdminResource] as z.ZodType<unknown>,
    );
  } else throw new HttpError(404, "This resource cannot be edited.");
  const { data, error } = await db(ctx.env).rpc("admin_write", {
    resource,
    document,
    actor_id: who.userId,
  });
  rpcError(error);
  return response(data, who);
});
