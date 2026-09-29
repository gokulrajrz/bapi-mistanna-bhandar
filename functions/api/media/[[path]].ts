import { db } from "../../../server/supabase";
import { endpoint, HttpError } from "../../../server/http";
export const onRequestGet = endpoint(async (ctx) => {
  const parts = ctx.params.path;
  const path = Array.isArray(parts) ? parts.join("/") : parts;
  if (!path || !/^catalogue\/[a-f\d-]+\.(jpeg|png|webp|avif)$/.test(path))
    throw new HttpError(404, "Image not found.");
  const { data, error } = await db(ctx.env)
    .storage.from("store-media")
    .download(path);
  if (error || !data) throw new HttpError(404, "Image not found.");
  return new Response(data, {
    headers: {
      "Content-Type": data.type,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
