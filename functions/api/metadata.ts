import { endpoint, response, HttpError } from "../../server/http";
import { pageMetadata } from "../../server/seo";
export const onRequestGet = endpoint(async (ctx) => {
  const path = new URL(ctx.request.url).searchParams.get("path") || "/";
  if (
    !/^\/(?:shop|story|gifts|build-a-box|journal(?:\/[a-z0-9-]+)?|products\/[a-z0-9-]+|store|policies)?$/.test(
      path,
    )
  )
    throw new HttpError(404, "Page not found.");
  const metadata = await pageMetadata(ctx.env, path),
    res = response(metadata);
  res.headers.set("Cache-Control", "public, max-age=15, s-maxage=30");
  return res;
});
