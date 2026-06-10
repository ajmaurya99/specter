import type { Fingerprint } from "./types";

/**
 * Detect the page's stack from raw HTML markers. Order matters: platforms
 * (WordPress) and meta-frameworks (Next/Nuxt/Gatsby) are more specific than
 * the view libraries they embed, so they are checked first and named first.
 */
const MARKERS: Array<{
  stack: string;
  pattern: RegExp;
  signal: string;
}> = [
  { stack: "WordPress", pattern: /wp-content\/|wp-includes\//i, signal: "wp-content asset paths" },
  { stack: "WordPress", pattern: /<meta[^>]+generator[^>]+wordpress/i, signal: "WordPress generator meta" },
  { stack: "Next.js", pattern: /__NEXT_DATA__|self\.__next_f|\/_next\/static\//, signal: "Next.js runtime payload" },
  { stack: "Nuxt", pattern: /__NUXT__|\/_nuxt\//, signal: "Nuxt runtime payload" },
  { stack: "Gatsby", pattern: /___gatsby|gatsby-chunk/i, signal: "Gatsby root container" },
  { stack: "SvelteKit", pattern: /sveltekit|data-sveltekit/i, signal: "SvelteKit attributes" },
  { stack: "Angular", pattern: /<[^>]+ng-version=/i, signal: "ng-version attribute" },
  { stack: "Vue", pattern: /<[^>]+data-v-[0-9a-f]{6,}|vue(?:\.runtime)?(?:\.min)?\.js/i, signal: "Vue scoped-style attributes" },
  { stack: "React", pattern: /data-reactroot|data-reactid|react(?:-dom)?(?:\.production)?(?:\.min)?\.js/i, signal: "React root markers" },
];

export function fingerprint(rawHtml: string): Fingerprint {
  const signals: string[] = [];
  let stack: string | null = null;

  for (const marker of MARKERS) {
    if (marker.pattern.test(rawHtml)) {
      if (!stack) stack = marker.stack;
      if (!signals.includes(marker.signal)) signals.push(marker.signal);
    }
  }

  // A bare root div that scripts fill in is itself a signal of a client-side
  // app even when the bundler left no framework marker.
  if (!stack && /<div[^>]+id=["'](root|app)["'][^>]*>\s*<\/div>/i.test(rawHtml)) {
    stack = "client-rendered JS app";
    signals.push("empty #root/#app container in raw HTML");
  }

  return { stack: stack ?? "plain HTML / unknown", signals };
}
