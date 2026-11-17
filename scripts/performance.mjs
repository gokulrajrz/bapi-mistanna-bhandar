import lighthouse from "lighthouse";
import { launch } from "chrome-launcher";
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
const origin = process.env.PERFORMANCE_ORIGIN || "http://localhost:4173";
const directory = process.env.PERFORMANCE_OUTPUT || "/tmp/bapi-performance";
mkdirSync(directory, { recursive: true });
const browser = await launch({
  chromePath: chromium.executablePath(),
  chromeFlags: ["--headless", "--no-sandbox", "--disable-dev-shm-usage"],
});
const reports = [];
try {
  for (const path of ["/", "/shop", "/products/kaju-katli"]) {
    const result = await lighthouse(origin + path, {
      port: browser.port,
      output: ["json", "html"],
      logLevel: "error",
      onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
    });
    const slug = path === "/" ? "home" : path.replaceAll("/", "-").slice(1);
    writeFileSync(`${directory}/${slug}.json`, result.report[0]);
    writeFileSync(`${directory}/${slug}.html`, result.report[1]);
    const summary = {
      path,
      scores: Object.fromEntries(
        Object.entries(result.lhr.categories).map(([k, v]) => [
          k,
          Math.round(v.score * 100),
        ]),
      ),
      lcpMs: result.lhr.audits["largest-contentful-paint"].numericValue,
      cls: result.lhr.audits["cumulative-layout-shift"].numericValue,
      tbtMs: result.lhr.audits["total-blocking-time"].numericValue,
      findings: Object.entries(result.lhr.audits)
        .filter(([, a]) => a.score !== null && a.score < 0.9 && a.details)
        .map(([id, a]) => ({ id, title: a.title, display: a.displayValue })),
    };
    reports.push(summary);
    console.log(JSON.stringify(summary));
  }
} finally {
  await browser.kill();
}
writeFileSync(
  `${directory}/summary.json`,
  JSON.stringify(
    {
      measuredAt: new Date().toISOString(),
      origin,
      mode: "Lighthouse mobile simulated throttling; local production preview",
      reports,
    },
    null,
    2,
  ),
);
if (
  reports.some(
    (r) =>
      r.scores.performance < 90 ||
      r.scores.accessibility < 95 ||
      r.scores["best-practices"] < 95,
  )
)
  process.exitCode = 1;
