import { chromium, type Browser } from "playwright";
import { registry } from "./registry";

/**
 * One Playwright browser per process, launched lazily on the first scan.
 * A crash clears the cached promise so the next scan relaunches; the scan
 * runner retries once on disconnection.
 */
export function getBrowser(): Promise<Browser> {
  const reg = registry();
  if (!reg.browser) {
    reg.browser = chromium
      .launch({ headless: true })
      .then((browser) => {
        browser.on("disconnected", () => {
          reg.browser = null;
        });
        return browser;
      })
      .catch((err) => {
        reg.browser = null;
        throw err;
      });
  }
  return reg.browser;
}

export async function closeBrowser(): Promise<void> {
  const reg = registry();
  if (!reg.browser) return;
  try {
    const browser = await reg.browser;
    await browser.close();
  } catch {
    // already gone
  } finally {
    reg.browser = null;
  }
}
