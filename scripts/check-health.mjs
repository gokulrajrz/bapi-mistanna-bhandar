const origin = process.env.STORE_ORIGIN;
if (!origin || !origin.startsWith("https://"))
  throw new Error("Set STORE_ORIGIN to the HTTPS store origin.");
const res = await fetch(new URL("/api/health", origin), {
  signal: AbortSignal.timeout(15000),
});
if (!res.ok)
  throw new Error(
    `Store operational health failed (${res.status}). Inspect Cloudflare logs and admin Overview.`,
  );
console.log("Store operational health is healthy.");
