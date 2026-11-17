import moduleFactory from "@jsquash/webp/codec/enc/webp_enc.js";
import { defaultOptions } from "@jsquash/webp/meta.js";
import wasmModule from "@jsquash/webp/codec/enc/webp_enc.wasm";

// A compiled module import works in Pages; fetching or compiling WASM at runtime does not.
let encoder: ReturnType<typeof moduleFactory> | undefined;
export async function encodeWebp(
  pixels: Uint8Array,
  width: number,
  height: number,
) {
  encoder ??= moduleFactory({
    noInitialRun: true,
    instantiateWasm(
      imports: WebAssembly.Imports,
      ready: (instance: WebAssembly.Instance) => void,
    ) {
      const instance = new WebAssembly.Instance(wasmModule, imports);
      ready(instance);
      return instance.exports;
    },
  });
  const codec = await encoder;
  const result = codec.encode(pixels, width, height, {
    ...defaultOptions,
    quality: 82,
    method: 4,
    low_memory: 1,
    thread_level: 0,
  });
  if (!result) throw new Error("WebP encoding failed");
  return result.slice();
}
