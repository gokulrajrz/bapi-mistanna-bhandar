import { admin } from "../../../server/admin";
import { db } from "../../../server/supabase";
import { imageDerivatives } from "../../../server/images";
import {
  endpoint,
  originGuard,
  response,
  HttpError,
  throttle,
} from "../../../server/http";
export const onRequestPost = endpoint(async (ctx) => {
  originGuard(ctx);
  await throttle(ctx, "upload", 20);
  const who = await admin(ctx);
  if (Number(ctx.request.headers.get("content-length") || 0) > 6 * 1024 * 1024)
    throw new HttpError(413, "Images must be smaller than 5 MB.");
  const reader = ctx.request.body?.getReader();
  if (!reader) throw new HttpError(400, "Choose an image.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 6 * 1024 * 1024) {
      await reader.cancel();
      throw new HttpError(413, "Images must be smaller than 5 MB.");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  let form: FormData;
  try {
    form = await new Response(body, {
      headers: {
        "content-type": ctx.request.headers.get("content-type") || "",
      },
    }).formData();
  } catch {
    throw new HttpError(400, "Choose an image using the upload form.");
  }
  const file = form.get("file");
  if (
    !(file instanceof File) ||
    file.size > 5 * 1024 * 1024 ||
    !["image/jpeg", "image/png", "image/webp"].includes(file.type)
  )
    throw new HttpError(
      400,
      "Choose a JPEG, PNG or WebP image smaller than 5 MB.",
    );
  const bytes = new Uint8Array(await file.arrayBuffer());
  const derivatives = await imageDerivatives(bytes, file.type);
  const base = `catalogue/${crypto.randomUUID()}`;
  const uploaded: string[] = [];
  const storage = db(ctx.env).storage.from("store-media");
  try {
    for (const { width, bytes } of derivatives) {
      const path = `${base}-${width}.webp`;
      const { error } = await storage.upload(path, bytes, {
        contentType: "image/webp",
        upsert: false,
      });
      if (error)
        throw new HttpError(503, "Image storage failed. Please try again.");
      uploaded.push(path);
    }
  } catch (e) {
    if (uploaded.length) await storage.remove(uploaded);
    throw e;
  }
  return response({ url: `/api/media/${base}-1280.webp` }, who, 201);
});
