import { beforeEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { imageSize } from "image-size";
const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  throttle: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@cf-wasm/photon/workerd", () => import("@cf-wasm/photon/node"));
vi.mock("@jsquash/webp/codec/enc/webp_enc.wasm", async () => {
  const { readFileSync } = await import("node:fs");
  return {
    default: new WebAssembly.Module(
      readFileSync("node_modules/@jsquash/webp/codec/enc/webp_enc.wasm"),
    ),
  };
});
vi.mock("../server/admin", () => ({ admin: mocks.admin }));
vi.mock("../server/http", async (original) => ({
  ...(await original<any>()),
  throttle: mocks.throttle,
}));
vi.mock("../server/supabase", async (original) => ({
  ...(await original<any>()),
  db: () => ({
    storage: { from: () => ({ upload: mocks.upload, remove: mocks.remove }) },
  }),
}));
import { onRequestPost } from "../functions/api/admin/upload";
import { HttpError } from "../server/http";
import type { Context } from "../server/supabase";
function context(
  bytes = readFileSync("public/images/hero-small.webp"),
  origin = "https://store.test",
  mime = "image/webp",
): Context {
  const form = new FormData();
  form.set(
    "file",
    new File([new Uint8Array(bytes)], "photo.webp", { type: mime }),
  );
  return {
    env: {} as Context["env"],
    params: {},
    request: new Request("https://store.test/api/admin/upload", {
      method: "POST",
      headers: { Origin: origin },
      body: form,
    }),
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin.mockResolvedValue({ userId: "owner", role: "owner" });
  mocks.throttle.mockResolvedValue(undefined);
  mocks.upload.mockResolvedValue({ error: null });
  mocks.remove.mockResolvedValue({ error: null });
});
it("uploads real derivatives privately without a service binding", async () => {
  const response = await onRequestPost(context());
  expect(response.status).toBe(201);
  expect(await response.json()).toMatchObject({
    url: expect.stringMatching(
      /^\/api\/media\/catalogue\/[a-f0-9-]+-1280.webp$/,
    ),
  });
  expect(mocks.upload).toHaveBeenCalledTimes(3);
  for (const [i, [path, bytes, options]] of mocks.upload.mock.calls.entries()) {
    expect(path).toMatch(new RegExp(`-${[320, 640, 1280][i]}\\.webp$`));
    expect(imageSize(bytes).type).toBe("webp");
    expect(options).toEqual({ contentType: "image/webp", upsert: false });
  }
});
it("cleans up earlier derivatives when storage fails partway", async () => {
  mocks.upload
    .mockResolvedValueOnce({ error: null })
    .mockResolvedValueOnce({ error: { message: "unavailable" } });
  const response = await onRequestPost(context());
  expect(response.status).toBe(503);
  expect(mocks.remove).toHaveBeenCalledWith([mocks.upload.mock.calls[0][0]]);
});
it("enforces origin, administrator access and rate limits before processing", async () => {
  expect(
    (await onRequestPost(context(undefined, "https://other.test"))).status,
  ).toBe(403);
  expect(mocks.admin).not.toHaveBeenCalled();
  mocks.admin.mockRejectedValueOnce(new HttpError(401, "Sign in"));
  expect((await onRequestPost(context())).status).toBe(401);
  mocks.throttle.mockRejectedValueOnce(new HttpError(429, "Wait"));
  expect((await onRequestPost(context())).status).toBe(429);
  expect(mocks.upload).not.toHaveBeenCalled();
});
it("rejects invalid and unsupported images without writing storage", async () => {
  expect((await onRequestPost(context(Buffer.from("invalid")))).status).toBe(
    422,
  );
  expect(
    (await onRequestPost(context(undefined, undefined, "image/avif"))).status,
  ).toBe(400);
  const ctx = context();
  ctx.request = new Request(ctx.request.url, {
    method: "POST",
    headers: {
      Origin: "https://store.test",
      "Content-Type": "multipart/form-data",
    },
    body: "malformed",
  });
  expect((await onRequestPost(ctx)).status).toBe(400);
  expect(mocks.upload).not.toHaveBeenCalled();
});
