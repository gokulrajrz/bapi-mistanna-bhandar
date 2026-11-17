import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { imageSize } from "image-size";
vi.mock("@cf-wasm/photon/workerd", () => import("@cf-wasm/photon/node"));
vi.mock("@jsquash/webp/codec/enc/webp_enc.wasm", async () => {
  const { readFileSync } = await import("node:fs");
  return {
    default: new WebAssembly.Module(
      readFileSync("node_modules/@jsquash/webp/codec/enc/webp_enc.wasm"),
    ),
  };
});
import { PhotonImage } from "@cf-wasm/photon/node";
import { imageDerivatives, maxImageBytes } from "../server/images";

function sampleImage(width = 80, height = 40, format = "png") {
  const pixels = new Uint8Array(width * height * 4).fill(200);
  for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;
  const source = new PhotonImage(pixels, width, height);
  try {
    return format === "jpg"
      ? source.get_bytes_jpeg(80)
      : format === "webp"
        ? source.get_bytes_webp()
        : source.get_bytes();
  } finally {
    source.free();
  }
}

describe("Pages WebAssembly image processing", () => {
  it.each([5, 6, 7, 8])(
    "applies JPEG EXIF orientation %i before stripping metadata",
    async (orientation) => {
      const jpeg = sampleImage(80, 40, "jpg");
      const exif = new Uint8Array(36);
      exif.set([0xff, 0xe1, 0, 34, 69, 120, 105, 102, 0, 0, 73, 73, 42, 0]);
      const view = new DataView(exif.buffer);
      view.setUint32(14, 8, true);
      view.setUint16(18, 1, true);
      view.setUint16(20, 0x0112, true);
      view.setUint16(22, 3, true);
      view.setUint32(24, 1, true);
      view.setUint16(28, orientation, true);
      const input = new Uint8Array(jpeg.length + exif.length);
      input.set(jpeg.subarray(0, 2));
      input.set(exif, 2);
      input.set(jpeg.subarray(2), 2 + exif.length);
      expect(imageSize(input).orientation).toBe(orientation);
      const result = await imageDerivatives(input, "image/jpeg");
      expect(imageSize(result[2].bytes)).toMatchObject({
        width: 40,
        height: 80,
      });
      expect(imageSize(result[2].bytes).orientation).toBeUndefined();
    },
  );
  it("bounds overlapping decode allocations with a retryable response", async () => {
    const first = imageDerivatives(sampleImage(), "image/png");
    await expect(
      imageDerivatives(sampleImage(), "image/png"),
    ).rejects.toMatchObject({ status: 429 });
    expect(await first).toHaveLength(3);
  });
  it.each(["png", "jpg", "webp"])(
    "decodes real %s images and encodes three WebP derivatives",
    async (type) => {
      const outputs = await imageDerivatives(
        sampleImage(800, 400, type),
        `image/${type === "jpg" ? "jpeg" : type}`,
      );
      expect(outputs.map((o) => o.width)).toEqual([320, 640, 1280]);
      expect(outputs.map((o) => imageSize(o.bytes))).toMatchObject([
        { type: "webp", width: 320, height: 160 },
        { type: "webp", width: 640, height: 320 },
        { type: "webp", width: 800, height: 400 },
      ]);
      // Decode the outputs again: signature checks alone do not prove valid encoding.
      for (const output of outputs) {
        const decoded = PhotonImage.new_from_byteslice(output.bytes);
        expect(decoded.get_width()).toBe(imageSize(output.bytes).width);
        decoded.free();
      }
    },
  );
  it("preserves portrait aspect ratio and caps height without upscaling", async () => {
    const outputs = await imageDerivatives(sampleImage(800, 1600), "image/png");
    expect(outputs.map((o) => imageSize(o.bytes))).toMatchObject([
      { width: 320, height: 640 },
      { width: 640, height: 1280 },
      { width: 640, height: 1280 },
    ]);
    expect(
      imageSize((await imageDerivatives(sampleImage(), "image/png"))[2].bytes),
    ).toMatchObject({ width: 80, height: 40 });
  });
  it("rejects size and dimension bombs before decoding", async () => {
    await expect(
      imageDerivatives(new Uint8Array(maxImageBytes + 1), "image/png"),
    ).rejects.toThrow("5 MB");
    const png = sampleImage();
    new DataView(png.buffer, png.byteOffset).setUint32(16, 100000);
    await expect(imageDerivatives(png, "image/png")).rejects.toThrow(
      "2 megapixels",
    );
  });
  it("rejects malformed images, MIME mismatches and unsupported AVIF", async () => {
    await expect(
      imageDerivatives(new Uint8Array([1, 2, 3]), "image/png"),
    ).rejects.toThrow("could not be decoded");
    await expect(imageDerivatives(sampleImage(), "image/jpeg")).rejects.toThrow(
      "contents match",
    );
    await expect(imageDerivatives(sampleImage(), "image/avif")).rejects.toThrow(
      "contents match",
    );
    const corrupt = sampleImage().slice(0, 35);
    await expect(imageDerivatives(corrupt, "image/png")).rejects.toThrow(
      "could not be decoded",
    );
    expect(await imageDerivatives(sampleImage(), "image/png")).toHaveLength(3);
  });
  it("processes the actual catalogue photograph with bounded output", async () => {
    const result = await imageDerivatives(
      readFileSync("public/images/hero.webp"),
      "image/webp",
    );
    expect(result).toHaveLength(3);
    expect(result[2].bytes.length).toBeLessThan(300000);
    for (const output of result) {
      const dimensions = imageSize(output.bytes);
      expect(dimensions.width).toBeLessThanOrEqual(output.width);
      expect(dimensions.height).toBeLessThanOrEqual(1280);
    }
  });
  it("rejects WebP canvas/frame mismatches before decoding", async () => {
    const webp = sampleImage(80, 40, "webp");
    const extended = new Uint8Array(webp.length + 18);
    extended.set(webp.subarray(0, 12));
    extended.set(
      [86, 80, 56, 88, 10, 0, 0, 0, 0, 0, 0, 0, 39, 0, 0, 19, 0, 0],
      12,
    );
    extended.set(webp.subarray(12), 30);
    new DataView(extended.buffer).setUint32(4, extended.length - 8, true);
    await expect(imageDerivatives(extended, "image/webp")).rejects.toThrow(
      "could not be decoded",
    );
    extended[20] = 2;
    await expect(imageDerivatives(extended, "image/webp")).rejects.toThrow(
      "could not be decoded",
    );
  });
});
