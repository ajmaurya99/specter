/**
 * Run the engine without any server: npx tsx scripts/scan-cli.ts <url>
 * Proves lib/engine is importable and testable standalone.
 */
import "dotenv/config";
import { chromium } from "playwright";
import { normalizeUrl, runScan } from "../lib/engine";

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: npx tsx scripts/scan-cli.ts <url>");
    process.exit(1);
  }

  const url = normalizeUrl(arg);
  const browser = await chromium.launch({ headless: true });
  try {
    const result = await runScan(
      {
        url,
        crawlerUserAgent: process.env.CRAWLER_USER_AGENT ?? "GPTBot/1.0",
        timeoutMs: Number(process.env.SCAN_TIMEOUT_MS ?? 25000),
        allowLocal: process.env.ALLOW_LOCAL_TARGETS === "true",
      },
      {
        browser,
        onProgress: (phase, telemetry) =>
          console.error(`[${phase}]`, JSON.stringify(telemetry)),
      },
    );
    const { rawText, ...rest } = result;
    console.log(JSON.stringify({ ...rest, rawTextChars: rawText.length }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
