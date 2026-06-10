import * as cheerio from "cheerio";

/**
 * Text normalization and shingling shared by the differ and classifier.
 * Everything operates on lowercase, entity-decoded, whitespace-collapsed text
 * so the same sentence matches regardless of markup differences.
 */

const WORD_SPLIT = /[^\p{L}\p{N}]+/u;

/** Lowercase, collapse all whitespace runs to single spaces, trim. */
export function normalizeWhitespace(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Split into word tokens (letters/digits only, punctuation dropped). */
export function tokenize(s: string): string[] {
  return normalizeWhitespace(s).split(WORD_SPLIT).filter(Boolean);
}

/** Overlapping n-word shingles, e.g. tokens 1..6, 2..7, ... */
export function shingles(tokens: string[], size = 6): string[] {
  if (tokens.length < size) return [];
  const out: string[] = [];
  for (let i = 0; i + size <= tokens.length; i++) {
    out.push(tokens.slice(i, i + size).join(" "));
  }
  return out;
}

const STOPWORDS = new Set([
  "about", "above", "after", "again", "their", "there", "these", "thing",
  "think", "those", "through", "under", "until", "where", "which", "while",
  "would", "could", "should", "other", "every", "first", "because", "between",
  "being", "before", "during", "since", "still", "without",
]);

/**
 * Tokens that identify a short region: numbers and uncommon words ≥ 5 chars.
 * Used when a region is too short for 6-word shingles.
 */
export function distinctiveTokens(tokens: string[]): string[] {
  return tokens.filter(
    (t) => /^\d/.test(t) || (t.length >= 5 && !STOPWORDS.has(t)),
  );
}

const BLOCK_TAGS =
  "p,h1,h2,h3,h4,h5,h6,li,ul,ol,div,section,article,aside,header,footer,nav," +
  "main,table,tr,td,th,caption,blockquote,pre,figure,figcaption,dl,dt,dd,br,hr";

/**
 * Visible-ish text of a raw HTML document: scripts, styles, and other
 * non-content elements stripped, entities decoded, whitespace collapsed.
 * Block elements become line boundaries — without them cheerio glues
 * "…Domain</h1><p>This…" into a phantom token that breaks shingle matching.
 * This is exactly what the crawler-view tab shows.
 */
export function extractRawText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, template").remove();
  $(BLOCK_TAGS).each((_, el) => {
    $(el).before("\n").after("\n");
  });
  return $("body").length
    ? collapseBlocks($("body").text())
    : collapseBlocks($.root().text());
}

function collapseBlocks(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/** Concatenated contents of inline <script> tags (no src attribute). */
export function extractInlineScripts(html: string): string {
  const $ = cheerio.load(html);
  const parts: string[] = [];
  $("script:not([src])").each((_, el) => {
    const content = $(el).text();
    if (content.trim()) parts.push(content);
  });
  return parts.join("\n");
}

/**
 * JSON-escaped strings inside scripts ("’", \" …) hide plain words from
 * a naive search; produce an additionally-unescaped variant for matching.
 */
export function unescapeScriptText(script: string): string {
  return script
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, " ")
    .replace(/\\\//g, "/")
    .replace(/\\(["'\\])/g, "$1");
}

/** Word count of already-normalized or raw text. */
export function countWords(s: string): number {
  return tokenize(s).length;
}
