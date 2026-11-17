// Internal service binding only; never accepts remote URLs or database credentials.
export default {
  async fetch(
    request: Request,
    env: { IMAGES: ImagesBinding },
  ): Promise<Response> {
    const width = Number(new URL(request.url).searchParams.get("width"));
    if (
      request.method !== "POST" ||
      !request.body ||
      ![320, 640, 1280].includes(width)
    )
      return new Response("Invalid image transform", { status: 400 });
    try {
      return (
        await env.IMAGES.input(request.body)
          .transform({ width, height: 1280, fit: "scale-down" })
          .output({ format: "image/webp", quality: 82, anim: false })
      ).response();
    } catch {
      return new Response("Image could not be decoded", { status: 422 });
    }
  },
};
