/** Dev utility: screenshot the three screens for visual review. */
import { chromium } from "playwright";

const [id1, id2] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

await page.goto("http://localhost:3100/");
await page.waitForTimeout(600);
await page.screenshot({ path: "/tmp/specter-input.png", fullPage: true });

await page.goto(`http://localhost:3100/scan/${id1}`);
await page.waitForTimeout(1400);
await page.screenshot({ path: "/tmp/specter-results-green.png", fullPage: true });

await page.goto(`http://localhost:3100/scan/${id2}`);
await page.waitForTimeout(1400);
await page.screenshot({ path: "/tmp/specter-results-red.png", fullPage: true });

// detail view: click the first region in the inspector list
await page.click("aside ul button");
await page.waitForTimeout(400);
await page.screenshot({ path: "/tmp/specter-detail.png", fullPage: true });

// scanning screen: kick a fresh scan and catch it mid-flight
const res = await page.request.post("http://localhost:3100/api/scan", {
  data: { url: "https://www.iana.org/domains/example", force: true },
});
const { scanId } = await res.json();
await page.goto(`http://localhost:3100/scan/${scanId}`);
await page.waitForTimeout(900);
await page.screenshot({ path: "/tmp/specter-scanning.png", fullPage: true });

await browser.close();
console.log("done");
