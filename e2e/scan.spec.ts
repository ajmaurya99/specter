import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { startFixtureServer, type FixtureMode } from "./fixture-server";

/**
 * The one end-to-end journey (spec: Testing expectations): scan a local
 * fixture page with a server-rendered section and a JS-injected section,
 * assert one green and one red region and a sensible score; then rescan the
 * improved fixture with force and assert a positive delta. Plus the typed
 * error states and a real-Chromium axe pass.
 */

const FIXTURE_PORT = 4173;
let fixture: Awaited<ReturnType<typeof startFixtureServer>>;

test.beforeAll(async () => {
  fixture = await startFixtureServer(FIXTURE_PORT);
});

test.afterAll(async () => {
  await fixture.close();
});

async function setMode(mode: FixtureMode) {
  fixture.setMode(mode);
}

async function submitScan(page: import("@playwright/test").Page, url: string) {
  await page.goto("/");
  await page.getByLabel("Page URL to scan").fill(url);
  await page.getByRole("button", { name: "Scan page" }).click();
}

test("scan → results → rescan improved → comparison, with axe pass", async ({ page }) => {
  test.setTimeout(180_000);
  await setMode("before");

  // --- first scan: green intro + red JS-rendered data section
  await submitScan(page, `${fixture.baseUrl}/page`);
  await page.waitForURL(/\/scan\//, { timeout: 15_000 });

  const inspector = page.getByRole("complementary", { name: "Inspector" });
  await expect(inspector).toBeVisible({ timeout: 90_000 });

  await expect(inspector.getByText("INVISIBLE", { exact: true }).first()).toBeVisible();
  await expect(inspector.getByText("VISIBLE", { exact: true }).first()).toBeVisible();

  const scoreText = await page
    .getByText(/Visibility score \d+ out of 100/)
    .textContent();
  const score = Number(scoreText?.match(/\d+/)?.[0]);
  expect(score).toBeGreaterThanOrEqual(20);
  expect(score).toBeLessThanOrEqual(80);

  // --- detail view: the copyable prompt embeds real scan data
  await inspector.getByRole("button", { name: /Live metrics|Section/ }).first().click();
  await expect(page.getByText("What the crawler found")).toBeVisible();
  const promptBox = page.locator("pre", { hasText: "Page:" });
  await expect(promptBox).toContainText(`${fixture.baseUrl}/page`);
  await expect(promptBox).toContainText("#data");
  await expect(page.getByRole("button", { name: "Copy" })).toBeVisible();
  await page.getByRole("button", { name: "← All regions" }).click();

  // --- page view tab overlays verdicts on the actual screenshot
  await page.getByRole("tab", { name: "Page view" }).click();
  const shot = page.getByRole("img", { name: "Screenshot of the rendered page" });
  await expect(shot).toBeVisible();
  // The image must actually load (the route served real bytes).
  await expect
    .poll(() => shot.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);

  // --- crawler view tab shows exactly what the differ saw
  await page.getByRole("tab", { name: "Crawler view" }).click();
  const crawlerPanel = page.getByRole("region", { name: "Crawler view: raw HTML text" });
  await expect(crawlerPanel).toContainText("This introductory section is rendered on the server");
  await expect(crawlerPanel).not.toContainText("Quarterly subscription revenue");

  // --- axe in real Chromium (covers color-contrast etc.)
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  const serious = axe.violations.filter((v) =>
    ["critical", "serious"].includes(v.impact ?? ""),
  );
  expect(
    serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(",")}`),
  ).toEqual([]);

  // --- improve the fixture, rescan with force via the cached-notice flow
  await setMode("after");
  await submitScan(page, `${fixture.baseUrl}/page`);
  await page.waitForURL(/\/scan\/.*cached=1/, { timeout: 15_000 });
  await expect(page.getByText(/Scanned .* ago — showing the cached result/)).toBeVisible();
  await page.getByRole("button", { name: "Rescan now" }).click();

  await expect(
    page.getByRole("region", { name: "Comparison with previous scan" }),
  ).toBeVisible({ timeout: 90_000 });

  const banner = await page.getByText(/\d+ → \d+/).textContent();
  const [prev, next] = banner!.match(/\d+/g)!.map(Number);
  expect(next).toBeGreaterThan(prev);
  await expect(page.getByText("↑ 1 improved")).toBeVisible();
  await expect(page.getByText("View previous scan")).toBeVisible();
});

test("typed error states render dedicated screens with the URL preserved", async ({
  page,
}) => {
  test.setTimeout(120_000);

  // PDF — scope to the heading (Next's route announcer mirrors the text).
  await submitScan(page, `${fixture.baseUrl}/pdf`);
  await expect(
    page.getByRole("heading", { name: "This isn't an HTML page." }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("link", { name: "Retry this URL" })).toHaveAttribute(
    "href",
    expect.stringContaining(encodeURIComponent(`${fixture.baseUrl}/pdf`)),
  );

  // login-gated
  await submitScan(page, `${fixture.baseUrl}/login-redirect`);
  await expect(
    page.getByRole("heading", { name: "This page is behind a login." }),
  ).toBeVisible({ timeout: 60_000 });

  // retry link prefills the input
  await page.getByRole("link", { name: "Retry this URL" }).click();
  await expect(page.getByLabel("Page URL to scan")).toHaveValue(
    `${fixture.baseUrl}/login-redirect`,
  );
});

test("crawler-blocked page leads with the blocked panel and CDN/WAF prompt", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await submitScan(page, `${fixture.baseUrl}/blocked`);
  await expect(
    page.getByRole("heading", {
      name: "AI crawlers are blocked at the door — fix this first.",
    }),
  ).toBeVisible({ timeout: 90_000 });
  await expect(
    page.getByText("Crawler user agent received", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("HTTP 403", { exact: false }).first()).toBeVisible();
  await expect(
    page.getByText("Desktop browser received", { exact: true }),
  ).toBeVisible();
  const prompt = page.locator("pre", { hasText: "allowlist" });
  await expect(prompt).toContainText("GPTBot");
});
