import { describe, it, expect, vi } from "vitest";
import worker from "../workers/images";
describe("internal image processor", () => {
  it.each([320, 640, 1280])(
    "decodes and re-encodes the %i derivative as a static WebP",
    async (width) => {
      const output = vi.fn(async () => ({
        response: () =>
          new Response("webp", { headers: { "content-type": "image/webp" } }),
      }));
      const transform = vi.fn(() => ({ output }));
      const input = vi.fn(() => ({ transform }));
      const response = await worker.fetch(
        new Request(`https://images.internal/?width=${width}`, {
          method: "POST",
          body: "image",
        }),
        { IMAGES: { input } as unknown as ImagesBinding },
      );
      expect(response.status).toBe(200);
      expect(transform).toHaveBeenCalledWith({
        width,
        height: 1280,
        fit: "scale-down",
      });
      expect(output).toHaveBeenCalledWith({
        format: "image/webp",
        quality: 82,
        anim: false,
      });
    },
  );
  it("rejects unsupported sizes before invoking the binding", async () => {
    const input = vi.fn();
    const response = await worker.fetch(
      new Request("https://images.internal/?width=9999", {
        method: "POST",
        body: "image",
      }),
      { IMAGES: { input } as unknown as ImagesBinding },
    );
    expect(response.status).toBe(400);
    expect(input).not.toHaveBeenCalled();
  });
  it("returns a controlled error when decoding fails", async () => {
    const input = vi.fn(() => {
      throw Error("invalid source");
    });
    const response = await worker.fetch(
      new Request("https://images.internal/?width=320", {
        method: "POST",
        body: "image",
      }),
      { IMAGES: { input } as unknown as ImagesBinding },
    );
    expect(response.status).toBe(422);
    expect(await response.text()).toBe("Image could not be decoded");
  });
});
