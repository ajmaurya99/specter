/**
 * Verifies the spec's asset requirement: the input page ships no
 * results-view JS. Loads "/" in a real browser, captures every script the
 * page downloads, and greps for strings that only exist in results-view
 * components. Run against a production server (next start).
 */
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
// Strings that exist only in results-view client components.
const MARKERS = ["Crawler view", "All regions", "Rescan now", "Copied ✓"];

const browser = await chromium.launch();
const page = await browser.newPage();

const scripts: string[] = [];
page.on("response", async (res) => {
  if (res.url().endsWith(".js") || res.headers()["content-type"]?.includes("javascript")) {
    scripts.push(await res.text().catch(() => ""));
  }
});

await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
const all = scripts.join("\n");
const leaked = MARKERS.filter((m) => all.includes(m));

if (leaked.length > 0) {
  console.error(`FAIL: input page JS contains results-view code: ${leaked.join(", ")}`);
  process.exit(1);
}
console.log(
  `OK: input page downloaded ${scripts.length} scripts; none contain results-view markers`,
);
await browser.close();
