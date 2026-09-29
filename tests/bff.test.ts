import { describe, it, expect } from "vitest";
import { onRequestPost } from "../functions/api/checkout";
const env = { SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "" };
const request = (body: unknown, origin = "https://shop.example") =>
  new Request("https://shop.example/api/checkout", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
describe("Cloudflare checkout boundary", () => {
  it("rejects cross-origin requests", async () => {
    expect(
      (
        await onRequestPost({
          request: request({}, "https://elsewhere.example"),
          env,
          params: {},
        })
      ).status,
    ).toBe(403);
  });
  it("keeps live checkout disabled until explicitly enabled", async () => {
    expect(
      (await onRequestPost({ request: request({}), env, params: {} })).status,
    ).toBe(503);
  });
  it("validates before touching the database", async () => {
    const response = await onRequestPost({
      request: request({ requestId: "not-a-uuid", items: [] }),
      env: { ...env, CHECKOUT_ENABLED: "true" },
      params: {},
    });
    expect(response.status).toBe(400);
  });
  it("rejects oversized requests", async () => {
    const response = await onRequestPost({
      request: request({ text: "x".repeat(33000) }),
      env: { ...env, CHECKOUT_ENABLED: "true" },
      params: {},
    });
    expect(response.status).toBe(413);
  });
});
