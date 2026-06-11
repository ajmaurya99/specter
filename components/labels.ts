import type { IssueType, Verdict } from "@/lib/engine/types";

/** Client-safe copy: plain, specific, expert. No engine imports. */

export const VERDICT_LABEL: Record<Verdict, string> = {
  ok: "VISIBLE",
  warn: "PARTIAL",
  bad: "INVISIBLE",
};

export const VERDICT_LONG: Record<Verdict, string> = {
  ok: "Visible",
  warn: "Partially visible",
  bad: "Invisible",
};

export const ISSUE_LABEL: Record<IssueType, string> = {
  fully_visible: "Fully visible",
  js_rendered_content: "JS-rendered content",
  data_in_script_variable: "Data trapped in a script variable",
  iframe_embed: "Content inside an iframe",
  canvas_or_image_data: "Data drawn as pixels",
  partial_content: "Partially visible content",
  client_side_routes: "JavaScript-only links",
  hidden_but_present: "Hidden but present in HTML",
};

export const WHY_IT_MATTERS: Record<IssueType, string> = {
  fully_visible:
    "This region's text exists in the initial HTML response, so AI crawlers index it without executing JavaScript. Nothing to do here.",
  js_rendered_content:
    "AI crawlers fetch the raw HTML and stop — they don't run your JavaScript. Everything this region renders client-side simply does not exist for them: it can't be indexed, quoted, or used to answer questions about your page.",
  data_in_script_variable:
    "The data technically ships in the response, but as code, not content. Most crawlers don't parse script payloads into indexable text, so models will rarely surface these values when asked.",
  iframe_embed:
    "Crawlers index the parent page, not embedded frames. Whatever lives inside the iframe — maps, tables, third-party widgets — is invisible in this page's context.",
  canvas_or_image_data:
    "Pixels aren't text. Data drawn into a canvas or baked into images without alt text cannot be read by crawlers at all — the numbers your users see are simply absent from the machine-readable page.",
  partial_content:
    "Crawlers see an incomplete version of this region. Summaries, lazy-loaded copy, or expanded sections that arrive via JavaScript are missing, so models may answer from a fraction of what users read.",
  client_side_routes:
    "Links that only work in JavaScript (#/… or javascript:) lead nowhere for a crawler. Every page behind them is undiscoverable from here, shrinking how much of your site AI systems can reach.",
  hidden_but_present:
    "Crawlers read this text even though users never see it. That's fine when it's an intentional no-JS fallback — and a liability when it's stale copy that contradicts the visible page.",
};

export const HOW_TO_FIX: Record<IssueType, string> = {
  fully_visible: "Nothing to fix. Keep rendering this region on the server.",
  js_rendered_content:
    "Render the same content as semantic HTML in the initial server response, then let the existing script hydrate or replace it once it loads — progressive enhancement, zero visual change.",
  data_in_script_variable:
    "Render the data as real HTML (a table, headings, paragraphs) server-side, and have the client script enhance that markup in place instead of building it from scratch.",
  iframe_embed:
    "Add a server-rendered summary of the iframe's content to the page itself — key facts or an excerpt — and keep the embed for interactive users.",
  canvas_or_image_data:
    "Render the underlying data as a semantic HTML table in the initial response, then let the script swap in the interactive visualization. The table doubles as the screen-reader path.",
  partial_content:
    "Find what this region gains client-side and include it in the initial server response. Collapse it visually if needed — the text just has to exist in the HTML.",
  client_side_routes:
    "Move to real URL paths with server-rendered entry points (history-API routing), keep client-side navigation as the enhancement, and redirect the old #/ routes.",
  hidden_but_present:
    "Confirm the hidden text is intentional (no-JS fallback, collapsed section). If it's stale or contradicts the visible page, remove it — crawlers may quote it.",
};

export function timeAgo(iso: string, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} d ago`;
}

export function ageMinutesSince(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
