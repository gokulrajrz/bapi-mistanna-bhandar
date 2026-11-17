import { imageSize } from "image-size";
import {
  PhotonImage,
  SamplingFilter,
  resize,
  rotate,
  fliph,
  flipv,
} from "@cf-wasm/photon/workerd";
import { HttpError } from "./http";
import { encodeWebp } from "./webp-encoder";

export const imageWidths = [320, 640, 1280] as const;
export const maxImageBytes = 5 * 1024 * 1024;
export const maxImagePixels = 2_000_000;
const mimeTypes: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};
const invalid = () =>
  new HttpError(
    422,
    "This image could not be decoded. Choose a valid JPEG, PNG or WebP image.",
  );

// Check the actual WebP frame too: VP8X canvas dimensions alone are untrusted.
function checkWebp(bytes: Uint8Array, width: number, height: number) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number) =>
    String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (
    bytes.length < 20 ||
    tag(0) !== "RIFF" ||
    tag(8) !== "WEBP" ||
    view.getUint32(4, true) + 8 !== bytes.length
  )
    throw invalid();
  let frames = 0;
  for (let offset = 12; offset < bytes.length;) {
    if (offset + 8 > bytes.length) throw invalid();
    const kind = tag(offset),
      length = view.getUint32(offset + 4, true),
      start = offset + 8;
    const end = start + length + (length % 2);
    if (end > bytes.length || ["ANIM", "ANMF"].includes(kind)) throw invalid();
    if (kind === "VP8X" && (length !== 10 || bytes[start] & 2)) throw invalid();
    if (kind === "VP8 " || kind === "VP8L") {
      let frameWidth: number, frameHeight: number;
      if (kind === "VP8 ") {
        if (
          length < 10 ||
          bytes[start] & 1 ||
          bytes[start + 3] !== 0x9d ||
          bytes[start + 4] !== 1 ||
          bytes[start + 5] !== 0x2a
        )
          throw invalid();
        frameWidth = view.getUint16(start + 6, true) & 0x3fff;
        frameHeight = view.getUint16(start + 8, true) & 0x3fff;
      } else {
        if (length < 5 || bytes[start] !== 0x2f) throw invalid();
        const bits = view.getUint32(start + 1, true);
        frameWidth = (bits & 0x3fff) + 1;
        frameHeight = ((bits >>> 14) & 0x3fff) + 1;
      }
      if (++frames !== 1 || frameWidth !== width || frameHeight !== height)
        throw invalid();
    }
    offset = end;
  }
  if (frames !== 1) throw invalid();
}

let processing = false;
export async function imageDerivatives(bytes: Uint8Array, mime: string) {
  if (!bytes.length || bytes.length > maxImageBytes)
    throw new HttpError(413, "Images must be smaller than 5 MB.");
  let dimensions: ReturnType<typeof imageSize>;
  try {
    dimensions = imageSize(bytes);
  } catch {
    throw invalid();
  }
  const { width, height, type, orientation = 1 } = dimensions;
  if (!type || mimeTypes[type] !== mime)
    throw new HttpError(
      400,
      "Choose a JPEG, PNG or WebP whose contents match its file type.",
    );
  if (
    width < 1 ||
    height < 1 ||
    width > 4096 ||
    height > 4096 ||
    width * height > maxImagePixels
  )
    throw new HttpError(
      413,
      "Resize this image to 2 megapixels or less, with neither side above 4096 pixels, before uploading.",
    );
  if (type === "webp") checkWebp(bytes, width, height);

  // Bound decoded memory per isolate even when requests overlap at encoder initialization.
  if (processing)
    throw new HttpError(
      429,
      "Another image is being processed. Please try again shortly.",
    );
  processing = true;
  let input: PhotonImage | undefined;
  try {
    input = PhotonImage.new_from_byteslice(bytes);
    if (input.get_width() !== width || input.get_height() !== height)
      throw invalid();
    // Bake JPEG orientation into the pixels before stripping metadata.
    if ([2, 5, 7].includes(orientation)) fliph(input);
    if (orientation === 4) flipv(input);
    const angle =
      orientation === 3
        ? 180
        : [5, 8].includes(orientation)
          ? 270
          : [6, 7].includes(orientation)
            ? 90
            : 0;
    if (angle) {
      const oriented = rotate(input, angle);
      input.free();
      input = oriented;
    }
    const source = input;
    const derivatives: { width: number; bytes: Uint8Array }[] = [];
    for (const width of imageWidths) {
      const scale = Math.min(
        1,
        width / source.get_width(),
        1280 / source.get_height(),
      );
      const output = resize(
        source,
        Math.max(1, Math.round(source.get_width() * scale)),
        Math.max(1, Math.round(source.get_height() * scale)),
        SamplingFilter.Triangle,
      );
      let pixels: Uint8Array, outputWidth: number, outputHeight: number;
      try {
        outputWidth = output.get_width();
        outputHeight = output.get_height();
        pixels = output.get_raw_pixels();
      } finally {
        output.free();
      }
      derivatives.push({
        width,
        bytes: await encodeWebp(pixels, outputWidth, outputHeight),
      });
    }
    return derivatives;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw invalid();
  } finally {
    try {
      input?.free();
    } finally {
      processing = false;
    }
  }
}
