import { describe, expect, it } from "vitest";
import { EngineError } from "@/lib/engine/errors";
import {
  assertPublicHost,
  detectBotBlock,
  fetchCrawlerView,
  guardedFetch,
  isPrivateIPv4,
  isPrivateIPv6,
  type LookupFn,
} from "@/lib/engine/fetcher";
import { canned, fakeFetch, fixtureFile } from "./helpers";

const CRAWLER_UA = "GPTBot/1.0";

async function errType(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "(no error)";
  } catch (err) {
    if (err instanceof EngineError) return err.type;
    throw err;
  }
}

const publicLookup: LookupFn = async () => [{ address: "93.184.216.34", family: 4 }];
const privateLookup: LookupFn = async () => [{ address: "10.0.0.5", family: 4 }];

describe("SSRF guard — IP range checks", () => {
  it.each([
    ["127.0.0.1", true],
    ["127.255.255.255", true],
    ["10.0.0.1", true],
    ["172.16.0.1", true],
    ["172.31.255.255", true],
    ["172.32.0.1", false],
    ["192.168.1.1", true],
    ["169.254.169.254", true],
    ["0.0.0.0", true],
    ["8.8.8.8", false],
    ["93.184.216.34", false],
  ])("isPrivateIPv4(%s) → %s", (ip, expected) => {
    expect(isPrivateIPv4(ip)).toBe(expected);
  });

  it.each([
    ["::1", true],
    ["fc00::1", true],
    ["fd12:3456::1", true],
    ["fe80::1", true],
    ["::ffff:10.0.0.1", true],
    ["::ffff:8.8.8.8", false],
    ["2606:2800:220:1::1", false],
  ])("isPrivateIPv6(%s) → %s", (ip, expected) => {
    expect(isPrivateIPv6(ip)).toBe(expected);
  });
});

describe("SSRF guard — assertPublicHost", () => {
  it("rejects IP-literal private hosts without a DNS lookup", async () => {
    await expect(errType(assertPublicHost("127.0.0.1"))).resolves.toBe("ssrf_blocked");
    await expect(errType(assertPublicHost("[::1]"))).resolves.toBe("ssrf_blocked");
  });

  it("rejects localhost by name", async () => {
    await expect(errType(assertPublicHost("localhost"))).resolves.toBe("ssrf_blocked");
  });

  it("rejects hostnames resolving to private ranges", async () => {
    await expect(errType(assertPublicHost("internal.corp", privateLookup))).resolves.toBe(
      "ssrf_blocked",
    );
  });

  it("rejects hostnames where ANY resolved address is private", async () => {
    const mixed: LookupFn = async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "192.168.0.10", family: 4 },
    ];
    await expect(errType(assertPublicHost("evil.example", mixed))).resolves.toBe(
      "ssrf_blocked",
    );
  });

  it("allows public hosts", async () => {
    await expect(assertPublicHost("example.com", publicLookup)).resolves.toBeUndefined();
  });

  it("maps resolution failure to dns_or_network", async () => {
    const failing: LookupFn = async () => {
      throw new Error("ENOTFOUND");
    };
    await expect(errType(assertPublicHost("nope.invalid", failing))).resolves.toBe(
      "dns_or_network",
    );
  });
});

describe("guardedFetch — redirects", () => {
  const opts = (fetchImpl: typeof fetch, lookup: LookupFn = publicLookup) => ({
    allowLocal: false,
    timeoutMs: 5000,
    fetchImpl,
    lookup,
  });

  it("follows redirects and records the chain", async () => {
    const fetchImpl = fakeFetch((url) => {
      if (url === "https://example.com/a")
        return canned("", { status: 301, location: "/b" });
      if (url === "https://example.com/b") return canned("<html>done</html>");
      return null;
    });
    const outcome = await guardedFetch("https://example.com/a", CRAWLER_UA, opts(fetchImpl));
    expect(outcome.finalUrl).toBe("https://example.com/b");
    expect(outcome.redirects).toEqual(["https://example.com/b"]);
    expect(outcome.status).toBe(200);
  });

  it("re-checks SSRF on every redirect hop", async () => {
    const fetchImpl = fakeFetch((url) => {
      if (url === "https://example.com/start")
        return canned("", { status: 302, location: "http://internal.corp/admin" });
      return null;
    });
    const lookup: LookupFn = async (host) =>
      host === "internal.corp"
        ? [{ address: "10.0.0.5", family: 4 }]
        : [{ address: "93.184.216.34", family: 4 }];
    await expect(
      errType(guardedFetch("https://example.com/start", CRAWLER_UA, opts(fetchImpl, lookup))),
    ).resolves.toBe("ssrf_blocked");
  });

  it("blocks redirects to non-http(s) schemes", async () => {
    const fetchImpl = fakeFetch((url) => {
      if (url === "https://example.com/x")
        return canned("", { status: 302, location: "ftp://example.com/file" });
      return null;
    });
    await expect(
      errType(guardedFetch("https://example.com/x", CRAWLER_UA, opts(fetchImpl))),
    ).resolves.toBe("ssrf_blocked");
  });

  it("gives up after five redirects", async () => {
    let n = 0;
    const fetchImpl = fakeFetch(() => {
      n += 1;
      return canned("", { status: 302, location: `/hop-${n}` });
    });
    await expect(
      errType(guardedFetch("https://example.com/loop", CRAWLER_UA, opts(fetchImpl))),
    ).resolves.toBe("dns_or_network");
  });

  it("maps timeouts to the timeout error type", async () => {
    const fetchImpl = (async () => {
      const err = new Error("aborted");
      err.name = "TimeoutError";
      throw err;
    }) as typeof fetch;
    await expect(
      errType(guardedFetch("https://example.com", CRAWLER_UA, opts(fetchImpl))),
    ).resolves.toBe("timeout");
  });

  it("allows private targets when allowLocal is set", async () => {
    const fetchImpl = fakeFetch(() => canned("<html>local</html>"));
    const outcome = await guardedFetch("http://localhost:3000/", CRAWLER_UA, {
      allowLocal: true,
      timeoutMs: 5000,
      fetchImpl,
    });
    expect(outcome.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------

const RICH_PAGE = `<html><head><title>Real</title></head><body><main>
  ${"<p>Genuine article content with plenty of detail about the subject matter at hand.</p>".repeat(20)}
</main></body></html>`;

function outcome(html: string, status = 200, url = "https://example.com/") {
  return {
    requestedUrl: url,
    finalUrl: url,
    status,
    contentType: "text/html",
    bytes: Buffer.byteLength(html),
    html,
    redirects: [],
    durationMs: 10,
  };
}

describe("detectBotBlock — fixtures per branch", () => {
  it("403-to-crawler fixture → status verdict", () => {
    const verdict = detectBotBlock(
      outcome("Forbidden", 403),
      outcome(RICH_PAGE, 200),
      CRAWLER_UA,
    );
    expect(verdict?.reason).toBe("status");
    expect(verdict?.evidence).toContain("HTTP 403");
    expect(verdict?.evidence).toContain("HTTP 200");
    expect(verdict?.fixPrompt).toContain("GPTBot/1.0");
  });

  it("challenge-page fixture → challenge verdict", () => {
    const challenge = fixtureFile("botblock/challenge.html");
    const verdict = detectBotBlock(
      outcome(challenge, 200),
      outcome(RICH_PAGE, 200),
      CRAWLER_UA,
    );
    expect(verdict?.reason).toBe("challenge");
    expect(verdict?.evidence).toContain("challenge page");
  });

  it("divergent-content fixture → divergence verdict", () => {
    const thin = `<html><body><p>Please enable JavaScript to view this site properly today.</p></body></html>`;
    const verdict = detectBotBlock(outcome(thin, 200), outcome(RICH_PAGE, 200), CRAWLER_UA);
    expect(verdict?.reason).toBe("divergence");
    expect(verdict?.evidence).toMatch(/\d+% text overlap/);
  });

  it("never claims blocked when the control fetch failed", () => {
    expect(detectBotBlock(outcome("Forbidden", 403), null, CRAWLER_UA)).toBeNull();
    expect(
      detectBotBlock(outcome("Forbidden", 403), outcome("oops", 500), CRAWLER_UA),
    ).toBeNull();
  });

  it("does not flag identical responses", () => {
    expect(
      detectBotBlock(outcome(RICH_PAGE, 200), outcome(RICH_PAGE, 200), CRAWLER_UA),
    ).toBeNull();
  });
});

describe("fetchCrawlerView — typed errors", () => {
  const deps = (route: Parameters<typeof fakeFetch>[0]) => ({
    fetchImpl: fakeFetch(route),
    lookup: publicLookup,
  });
  const input = {
    url: "https://example.com/page",
    crawlerUserAgent: CRAWLER_UA,
    allowLocal: false,
  };

  it("non-HTML response (PDF) → unsupported_content_type", async () => {
    const view = fetchCrawlerView(input, deps((url) =>
      url.includes("/page")
        ? canned("%PDF-1.7 ...", { contentType: "application/pdf" })
        : null,
    ));
    await expect(errType(view)).resolves.toBe("unsupported_content_type");
  });

  it("PDF magic bytes with a lying content-type → unsupported_content_type", async () => {
    const view = fetchCrawlerView(input, deps((url) =>
      url.includes("/page") ? canned("%PDF-1.7 binary", { contentType: "text/html" }) : null,
    ));
    await expect(errType(view)).resolves.toBe("unsupported_content_type");
  });

  it("redirect chain landing on /login → login_redirect", async () => {
    const loginPage = `<html><body><form><input type="password" name="pw"></form></body></html>`;
    const view = fetchCrawlerView(input, deps((url) => {
      if (url.includes("/page")) return canned("", { status: 302, location: "/login?next=%2Fpage" });
      if (url.includes("/login")) return canned(loginPage);
      return null;
    }));
    await expect(errType(view)).resolves.toBe("login_redirect");
  });

  it("page dominated by a password field → login_redirect", async () => {
    const wall = `<html><body><h1>Sign in</h1><form><input type="password"></form></body></html>`;
    const view = fetchCrawlerView(input, deps((url) =>
      url.includes("/page") ? canned(wall) : null,
    ));
    await expect(errType(view)).resolves.toBe("login_redirect");
  });

  it("bot-block wins over login detection (crawler sent to login, browser sees content)", async () => {
    const view = await fetchCrawlerView(input, deps((url, ua) => {
      const isCrawler = ua.includes("GPTBot");
      if (url.includes("/page")) {
        return isCrawler ? canned("Forbidden", { status: 403 }) : canned(RICH_PAGE);
      }
      return null;
    }));
    expect(view.blocked?.reason).toBe("status");
    // Analysis falls back to the browser-UA response.
    expect(view.rawHtml).toContain("Genuine article content");
  });
});

describe("fetchCrawlerView — robots.txt and llms.txt", () => {
  it("captures robots content and llms.txt presence", async () => {
    const view = await fetchCrawlerView(
      {
        url: "https://example.com/docs/intro",
        crawlerUserAgent: CRAWLER_UA,
        allowLocal: false,
      },
      {
        lookup: publicLookup,
        fetchImpl: fakeFetch((url) => {
          if (url === "https://example.com/robots.txt")
            return canned("User-agent: *\nDisallow: /private/", { contentType: "text/plain" });
          if (url === "https://example.com/llms.txt")
            return canned("# Docs\n- /docs/intro: introduction", { contentType: "text/plain" });
          if (url.includes("/docs/intro")) return canned(RICH_PAGE);
          return null;
        }),
      },
    );
    expect(view.robotsContent).toContain("Disallow: /private/");
    expect(view.llmsTxt.present).toBe(true);
    expect(view.llmsTxt.linksToPath).toBe(true);
  });

  it("treats SPA-style HTML responses for robots.txt as absent", async () => {
    const view = await fetchCrawlerView(
      { url: "https://example.com/", crawlerUserAgent: CRAWLER_UA, allowLocal: false },
      {
        lookup: publicLookup,
        fetchImpl: fakeFetch((url) => {
          if (url.endsWith("robots.txt") || url.endsWith("llms.txt"))
            return canned("<!doctype html><html><body>app shell</body></html>");
          return canned(RICH_PAGE);
        }),
      },
    );
    expect(view.robotsContent).toBeNull();
    expect(view.llmsTxt.present).toBe(false);
  });
});
