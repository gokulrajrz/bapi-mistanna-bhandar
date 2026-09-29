import { settingsSchemas } from "../shared/admin-schema";
import { defaultStorefront } from "../src/lib/content";
import { expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { verifyHmac } from "../server/razorpay";
import { sessionCookies } from "../server/auth";
import { readBody, originGuard } from "../server/http";
import type { Context } from "../server/supabase";
it("keeps Supabase and database clients outside the browser source tree", () => {
  function files(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)],
    );
  }
  for (const file of files("src").filter((f) => /\.[tj]sx?$/.test(f))) {
    expect(readFileSync(file, "utf8"), file).not.toMatch(
      /from\s+['"][^'"]*(?:supabase|server\/)|VITE_SUPABASE|supabase\.co/,
    );
  }
});
it("verifies exact webhook bytes and rejects tampering", async () => {
  const secret = "test-only-secret",
    message = '{"event":"payment.captured"}';
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = Array.from(
    new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  expect(await verifyHmac(secret, message, sig)).toBe(true);
  expect(await verifyHmac(secret, message + " ", sig)).toBe(false);
  expect(await verifyHmac(secret, message, "bad")).toBe(false);
});
it("uses secure HttpOnly cookies and rejects cross-origin writes", () => {
  expect(
    sessionCookies(new Request("https://shop.test"), null).every((c) =>
      c.includes("HttpOnly; SameSite=Lax; Secure"),
    ),
  ).toBe(true);
  expect(() =>
    originGuard({
      request: new Request("https://shop.test/api/checkout", {
        headers: { Origin: "https://attacker.test" },
      }),
      env: {},
    } as Context),
  ).toThrow("origin");
});
it("limits streamed bodies even without a content-length header", async () => {
  await expect(
    readBody(
      new Request("https://shop.test", {
        method: "POST",
        body: "a".repeat(100),
      }),
      20,
    ),
  ).rejects.toThrow("too large");
});

it("rejects unreadable administrator theme colours", () => {
  expect(settingsSchemas.storefront.safeParse(defaultStorefront).success).toBe(
    true,
  );
  expect(
    settingsSchemas.storefront.safeParse({
      ...defaultStorefront,
      primaryColor: "#ffffff",
    }).success,
  ).toBe(false);
});
