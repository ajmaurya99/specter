// Phase 0 smoke test: verifies Playwright chromium launches inside the
// Next.js server process and renders a page. Deleted in Phase 2.
import { chromium } from "playwright";

export const dynamic = "force-dynamic";

export async function GET() {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(
      "data:text/html,<title>specter-smoke</title><h1>render ok</h1>",
    );
    const title = await page.title();
    await context.close();
    return Response.json({ ok: true, title });
  } finally {
    await browser.close();
  }
}
