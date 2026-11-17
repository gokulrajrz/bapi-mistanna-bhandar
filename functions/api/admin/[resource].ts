import { adminList } from "../../../server/admin-list";
import { storefrontExtra } from "../../../shared/storefront-extra";
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
  ...Object.keys(resourceSchemas).filter((key) => key !== "customers"),
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
  const result = await adminList(ctx, resource, who.userId!);
  const data = result.items;
  if (resource === "settings")
    for (const row of (data || []) as unknown as {
      key: string;
      value: Record<string, unknown> & { home?: object };
    }[])
      if (row.key === "storefront")
        row.value = {
          ...storefrontExtra,
          ...row.value,
          pages: {
            ...storefrontExtra.pages,
            ...((row.value.pages as object) || {}),
          },
          home: { ...homeContent, ...row.value.home },
        };
  return response({ ...result, items: data }, who);
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
        revision: z.number().int().nonnegative().default(0),
      }),
    );
    const parsed = settingsSchemas[input.key].safeParse(input.value);
    if (!parsed.success)
      throw new HttpError(400, parsed.error.issues[0].message);
    document = { key: input.key, value: parsed.data, revision: input.revision };
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
  } else if (resource in resourceSchemas && resource !== "customers") {
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

export const onRequestDelete = endpoint(async (ctx) => {
  originGuard(ctx);
  await throttle(ctx, "admin-write", 60);
  const who = await admin(ctx);
  if (ctx.params.resource !== "admin_users")
    throw new HttpError(404, "Resource not found.");
  if (who.role !== "owner") throw new HttpError(403, "Owner access required.");
  const input = await body(ctx.request, z.object({ user_id: z.uuid() }));
  const { data, error } = await db(ctx.env).rpc("revoke_admin_access", {
    actor_id: who.userId,
    target: input.user_id,
  });
  rpcError(error);
  return response(data, who);
});
