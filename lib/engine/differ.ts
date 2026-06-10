import {
  distinctiveTokens,
  shingles,
  tokenize,
  unescapeScriptText,
} from "./text";
import type { DiffResult } from "./types";

/**
 * Text-presence diffing between the raw crawler-visible HTML and rendered
 * regions. Long regions match on shingled 6-word sequences (robust against
 * markup reflow); short regions fall back to distinctive tokens (numbers,
 * rare words) so a 5-word stat line can still be located.
 */

export const SHINGLE_SIZE = 6;
/** Regions with fewer tokens than this use the distinctive-token fallback. */
export const SHORT_REGION_TOKENS = 12;

export interface Differ {
  diff(regionText: string): DiffResult;
}

interface Haystack {
  shingleSet: Set<string>;
  tokenSet: Set<string>;
}

function buildHaystack(text: string): Haystack {
  const tokens = tokenize(text);
  return {
    shingleSet: new Set(shingles(tokens, SHINGLE_SIZE)),
    tokenSet: new Set(tokens),
  };
}

function fraction(found: number, total: number): number {
  if (total === 0) return 0;
  return found / total;
}

function coverageAgainst(regionTokens: string[], hay: Haystack): number {
  if (regionTokens.length >= SHORT_REGION_TOKENS) {
    const regionShingles = shingles(regionTokens, SHINGLE_SIZE);
    const found = regionShingles.filter((s) => hay.shingleSet.has(s)).length;
    return fraction(found, regionShingles.length);
  }
  let needles = distinctiveTokens(regionTokens);
  if (needles.length === 0) needles = regionTokens;
  if (needles.length === 0) return 0;
  const found = needles.filter((t) => hay.tokenSet.has(t)).length;
  return fraction(found, needles.length);
}

/**
 * Build a differ for one scan: the raw text and inline-script haystacks are
 * indexed once, then every region diffs against them.
 */
export function createDiffer(rawText: string, inlineScriptText: string): Differ {
  const rawHay = buildHaystack(rawText);
  // Index the script text both as-is and JSON-unescaped, so content hiding
  // in `var DATA = "...’..."` still matches.
  const scriptHay = buildHaystack(
    `${inlineScriptText}\n${unescapeScriptText(inlineScriptText)}`,
  );

  return {
    diff(regionText: string): DiffResult {
      const regionTokens = tokenize(regionText);
      if (regionTokens.length === 0) {
        return { coverage: 0, foundInScripts: 0 };
      }
      return {
        coverage: coverageAgainst(regionTokens, rawHay),
        foundInScripts: coverageAgainst(regionTokens, scriptHay),
      };
    },
  };
}
