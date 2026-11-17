import { admin } from "../../../server/admin";
import { db } from "../../../server/supabase";
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
  const form = await new Response(body, {
    headers: { "content-type": ctx.request.headers.get("content-type") || "" },
  }).formData();
  const file = form.get("file");
  if (
    !(file instanceof File) ||
    file.size > 5 * 1024 * 1024 ||
    !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type)
  )
    throw new HttpError(
      400,
      "Choose a JPEG, PNG, WebP or AVIF image smaller than 5 MB.",
    );
  const bytes = new Uint8Array(await file.arrayBuffer());
  const valid =
    file.type === "image/jpeg"
      ? bytes[0] === 255 && bytes[1] === 216
      : file.type === "image/png"
        ? bytes[0] === 137 && bytes[1] === 80
        : file.type === "image/webp"
          ? new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
          : new TextDecoder().decode(bytes.slice(4, 8)) === "ftyp";
  if (!valid)
    throw new HttpError(400, "Image contents do not match the file type.");
  if (!ctx.env.IMAGE_PROCESSOR)
    throw new HttpError(
      503,
      "Image processing is not configured. Connect the Cloudflare image service before uploading.",
    );
  const base = `catalogue/${crypto.randomUUID()}`;
  const uploaded: string[] = [];
  const storage = db(ctx.env).storage.from("store-media");
  try {
    for (const width of [320, 640, 1280]) {
      const transformed = await ctx.env.IMAGE_PROCESSOR.fetch(
        `https://images.internal/?width=${width}`,
        { method: "POST", body: bytes, headers: { "Content-Type": file.type } },
      );
      if (!transformed.ok)
        throw new HttpError(
          422,
          "This image could not be processed. Choose a valid photograph.",
        );
      const path = `${base}-${width}.webp`;
      const { error } = await storage.upload(
        path,
        await transformed.arrayBuffer(),
        { contentType: "image/webp", upsert: false },
      );
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
