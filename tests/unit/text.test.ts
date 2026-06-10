import { describe, expect, it } from "vitest";
import {
  countWords,
  distinctiveTokens,
  extractInlineScripts,
  extractRawText,
  normalizeWhitespace,
  shingles,
  tokenize,
  unescapeScriptText,
} from "@/lib/engine/text";

describe("normalizeWhitespace / tokenize", () => {
  it("lowercases and collapses whitespace", () => {
    expect(normalizeWhitespace("  Hello\n\tWORLD  ")).toBe("hello world");
  });

  it("drops punctuation when tokenizing", () => {
    expect(tokenize("It's 4.2M — up 12%!")).toEqual(["it", "s", "4", "2m", "up", "12"]);
  });
});

describe("shingles", () => {
  it("produces overlapping 6-word windows", () => {
    const tokens = "a b c d e f g h".split(" ");
    expect(shingles(tokens)).toEqual(["a b c d e f", "b c d e f g", "c d e f g h"]);
  });

  it("returns nothing for short inputs", () => {
    expect(shingles(["a", "b", "c"])).toEqual([]);
  });
});

describe("distinctiveTokens", () => {
  it("keeps numbers and rare long words, drops stopwords and short words", () => {
    expect(distinctiveTokens(["the", "42", "shoreline", "which", "of", "2m"])).toEqual([
      "42",
      "shoreline",
      "2m",
    ]);
  });
});

describe("extractRawText", () => {
  it("strips scripts, styles and noscript", () => {
    const html = `<html><body><style>p{color:red}</style>
      <p>Visible paragraph.</p>
      <script>var hidden = "should not appear";</script>
      <noscript>fallback text</noscript></body></html>`;
    const text = extractRawText(html);
    expect(text).toContain("Visible paragraph.");
    expect(text).not.toContain("should not appear");
    expect(text).not.toContain("fallback text");
    expect(text).not.toContain("color:red");
  });
});

describe("extractInlineScripts", () => {
  it("concatenates inline scripts only", () => {
    const html = `<html><body>
      <script src="/bundle.js"></script>
      <script>var a = "first";</script>
      <script type="application/json">{"b": "second"}</script>
    </body></html>`;
    const scripts = extractInlineScripts(html);
    expect(scripts).toContain('var a = "first"');
    expect(scripts).toContain('"b": "second"');
    expect(scripts).not.toContain("/bundle.js");
  });
});

describe("unescapeScriptText", () => {
  it("unescapes JSON-style escapes", () => {
    expect(unescapeScriptText('say \\"hi\\" \\u0026 wave\\n')).toBe('say "hi" & wave\n');
    expect(unescapeScriptText("a\\/b")).toBe("a/b");
  });
});

describe("countWords", () => {
  it("counts word tokens", () => {
    expect(countWords("one two, three!")).toBe(3);
    expect(countWords("   ")).toBe(0);
  });
});
