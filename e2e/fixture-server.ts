import http from "node:http";

/**
 * Local fixture site for the e2e. Mutable mode:
 *  - "before": server-rendered intro + a #data section filled by external JS
 *    (one green region, one red region)
 *  - "after": the same data server-rendered (the "improved" fixture)
 * Plus typed-error fixtures (/pdf, /login-redirect) and a /blocked page that
 * 403s the crawler user agent.
 */

export type FixtureMode = "before" | "after";

const INTRO = `Specter fixture page for end to end testing. This introductory
section is rendered on the server, so an AI crawler reading the raw HTML
response sees every one of these words without executing any JavaScript at
all. It exists to produce one reliably green region in the scan results.`;

const DATA_SENTENCE = `Quarterly subscription revenue reached 48.2 million
dollars while churn dropped below two percent across every paid tier that the
fixture dashboard tracks for this end to end scenario.`;

const INJECTOR = `document.getElementById("data").innerHTML =
  "<h2>Live metrics</h2><p>${DATA_SENTENCE.replace(/\s+/g, " ").trim()}</p>";`;

function pageHtml(mode: FixtureMode): string {
  return `<!doctype html>
<html lang="en">
<head><title>Fixture page</title><meta name="description" content="Specter e2e fixture page"></head>
<body>
<main>
  <section id="intro" style="min-height:160px;padding:24px">
    <h1>Fixture article</h1>
    <p>${INTRO.replace(/\s+/g, " ").trim()}</p>
  </section>
  <section id="data" style="min-height:220px;padding:24px">
    ${mode === "after" ? `<h2>Live metrics</h2><p>${DATA_SENTENCE.replace(/\s+/g, " ").trim()}</p>` : ""}
  </section>
</main>
${mode === "before" ? `<script src="/app.js"></script>` : ""}
</body>
</html>`;
}

const LOGIN_PAGE = `<!doctype html><html lang="en"><head><title>Sign in</title></head>
<body><h1>Sign in</h1><form><input type="email" name="user"><input type="password" name="pw"><button>Go</button></form></body></html>`;

const RICH_BLOCKED_PAGE = `<!doctype html><html lang="en"><head><title>Protected</title></head>
<body><main><h1>Protected content</h1>${`<p>Genuine article paragraph with plenty of crawlable text in it for the control fetch comparison.</p>`.repeat(15)}</main></body></html>`;

export function startFixtureServer(port: number): Promise<{
  setMode: (mode: FixtureMode) => void;
  close: () => Promise<void>;
  baseUrl: string;
}> {
  let mode: FixtureMode = "before";

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    const ua = req.headers["user-agent"] ?? "";

    if (req.method === "POST" && url.pathname === "/__mode") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        mode = JSON.parse(body).mode as FixtureMode;
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ mode }));
      });
      return;
    }

    switch (url.pathname) {
      case "/page":
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(pageHtml(mode));
        return;
      case "/app.js":
        res.writeHead(200, { "content-type": "text/javascript" });
        res.end(INJECTOR);
        return;
      case "/pdf":
        res.writeHead(200, { "content-type": "application/pdf" });
        res.end("%PDF-1.7 fake fixture pdf");
        return;
      case "/login-redirect":
        res.writeHead(302, { location: "/login" });
        res.end();
        return;
      case "/login":
        res.writeHead(200, { "content-type": "text/html" });
        res.end(LOGIN_PAGE);
        return;
      case "/blocked":
        if (/GPTBot/i.test(String(ua))) {
          res.writeHead(403, { "content-type": "text/html" });
          res.end("<html><body>Forbidden</body></html>");
        } else {
          res.writeHead(200, { "content-type": "text/html" });
          res.end(RICH_BLOCKED_PAGE);
        }
        return;
      default:
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("not found");
    }
  });

  return new Promise((resolve) => {
    server.listen(port, () =>
      resolve({
        setMode: (m) => {
          mode = m;
        },
        close: () => new Promise((r) => server.close(() => r())),
        baseUrl: `http://localhost:${port}`,
      }),
    );
  });
}
