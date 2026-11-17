import { admin } from "../../../server/admin";
import { adminList } from "../../../server/admin-list";
import { endpoint, response, HttpError } from "../../../server/http";
export const onRequestGet = endpoint(async (ctx) => {
  const who = await admin(ctx);
  const kind = new URL(ctx.request.url).searchParams.get("kind") || "";
  if (!["products", "collections", "users"].includes(kind))
    throw new HttpError(400, "Invalid lookup.");
  if (kind === "users" && who.role !== "owner")
    throw new HttpError(403, "Owner access required.");
  const result = await adminList(ctx, kind, who.userId!);
  return response(
    {
      ...result,
      items: result.items.map((r) => ({
        id: r.id,
        label:
          kind === "users"
            ? [r.person?.name, r.person?.email || r.person?.phone, r.id]
                .filter(Boolean)
                .join(" · ")
            : r.data?.name || r.title || r.id,
      })),
    },
    who,
  );
});
