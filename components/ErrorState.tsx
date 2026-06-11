import Link from "next/link";

/** One dedicated, helpful screen per typed engine error. Direction, never apologies. */

interface ErrorCopy {
  title: string;
  what: string;
  next: string;
}

const COPY: Record<string, ErrorCopy> = {
  unsupported_content_type: {
    title: "This isn't an HTML page.",
    what: "The URL serves a file (PDF, image, or JSON) — Specter analyzes HTML pages, where crawler visibility is decided.",
    next: "Point Specter at a page URL — an article, landing page, or docs page.",
  },
  timeout: {
    title: "The page outran the render budget.",
    what: "It didn't settle within the time limit. Heavy pages, long-polling, or websockets can keep the network busy past the cap.",
    next: "Retry — transient slowness is common. If it times out repeatedly, scan a lighter page on the same site to judge the template.",
  },
  login_redirect: {
    title: "This page is behind a login.",
    what: "The crawler was redirected to a sign-in form. AI crawlers browse anonymously, so they hit the same wall.",
    next: "Scan a public URL. If this content should be crawler-visible, that's the finding: it isn't.",
  },
  dns_or_network: {
    title: "Couldn't reach that host.",
    what: "DNS resolution or the connection failed before any HTML arrived.",
    next: "Check the URL for typos and that the site is up, then retry.",
  },
  render_failed: {
    title: "Rendering failed.",
    what: "The headless browser couldn't finish loading or analyzing the page.",
    next: "Retry — if it persists, the page may be crashing the renderer; try another page on the same site.",
  },
  ssrf_blocked: {
    title: "That address is private.",
    what: "The hostname points at a private or reserved network range, which Specter refuses by default.",
    next: "To scan your own local site, set ALLOW_LOCAL_TARGETS=true in .env and restart the server.",
  },
};

const FALLBACK: ErrorCopy = {
  title: "The scan failed.",
  what: "Something went wrong outside the usual failure modes.",
  next: "Retry the scan; check the server logs if it keeps happening.",
};

export function ErrorState({
  errorType,
  message,
  url,
}: {
  errorType: string;
  message?: string;
  url: string;
}) {
  const copy = COPY[errorType] ?? FALLBACK;
  const retryHref = `/?url=${encodeURIComponent(url)}`;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col items-center justify-center gap-6 px-6 py-16">
      <div className="w-full rounded-card border border-hairline bg-surface p-6 shadow-soft">
        <p className="mb-2 font-mono text-[10px] font-bold tracking-widest text-muted">
          SCAN STOPPED — {errorType.toUpperCase()}
        </p>
        <h1 className="text-2xl font-extrabold tracking-tight">{copy.title}</h1>
        <p className="mt-1 truncate font-mono text-xs text-muted" title={url}>
          {url}
        </p>

        <h2 className="mt-5 text-xs font-semibold uppercase tracking-wider text-muted">
          What happened
        </h2>
        <p className="mt-1 text-sm leading-relaxed">{copy.what}</p>
        {message && <p className="mt-2 font-mono text-xs text-muted">{message}</p>}

        <h2 className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted">
          What to try
        </h2>
        <p className="mt-1 text-sm leading-relaxed">{copy.next}</p>

        <div className="mt-6 flex gap-2">
          <Link
            href={retryHref}
            className="rounded-field bg-ink px-4 py-2 text-sm font-semibold text-surface hover:opacity-85"
          >
            Retry this URL
          </Link>
          <Link
            href="/"
            className="rounded-field border border-hairline px-4 py-2 text-sm font-semibold hover:bg-bg"
          >
            New scan
          </Link>
        </div>
      </div>
    </main>
  );
}
