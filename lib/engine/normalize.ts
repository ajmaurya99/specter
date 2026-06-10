/**
 * URL normalization. Scans are stored per normalized URL: lowercase host,
 * default port and fragment stripped, trailing slash removed (except root),
 * tracking params dropped, remaining params sorted for a stable key.
 */

const TRACKING_PARAM = /^(utm_\w+|gclid|fbclid|msclkid|mc_cid|mc_eid)$/i;

export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  const url = new URL(withScheme); // throws TypeError on garbage — caller maps it

  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();
  if (
    (url.protocol === "https:" && url.port === "443") ||
    (url.protocol === "http:" && url.port === "80")
  ) {
    url.port = "";
  }
  url.hash = "";

  const kept = [...url.searchParams.entries()]
    .filter(([k]) => !TRACKING_PARAM.test(k))
    .sort(([a], [b]) => a.localeCompare(b));
  url.search = "";
  for (const [k, v] of kept) url.searchParams.append(k, v);

  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }

  return url.toString();
}

/** The 10-minute scan dedupe window. */
export const DEDUPE_WINDOW_MS = 10 * 60 * 1000;

export function isWithinDedupeWindow(
  finishedAt: Date,
  now: Date,
  windowMs: number = DEDUPE_WINDOW_MS,
): boolean {
  const age = now.getTime() - finishedAt.getTime();
  return age >= 0 && age < windowMs;
}
