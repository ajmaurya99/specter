import type { Rect, Verdict } from "./types";

/**
 * Weighted 0–100 visibility score.
 *
 * Weight = a region's share of the page, with an area floor so a large empty
 * interactive region (canvas, map) still counts even though it renders few
 * words: rawWeight = max(wordShare, areaShare). The raw maxes can sum past 1,
 * so weights are normalized to sum to exactly 1 — the only reading that keeps
 * the score bounded at 100 (flagged as an interpretation in the README).
 */

export const VERDICT_VALUE: Record<Verdict, number> = {
  ok: 1,
  warn: 0.5,
  bad: 0,
};

export interface ScorableRegion {
  wordCount: number;
  boundingBox: Rect;
  status: Verdict;
}

function area(rect: Rect): number {
  return Math.max(0, rect.width) * Math.max(0, rect.height);
}

/** Normalized weights, index-aligned with the input regions. */
export function computeWeights(
  regions: Array<Pick<ScorableRegion, "wordCount" | "boundingBox">>,
): number[] {
  const totalWords = regions.reduce((sum, r) => sum + r.wordCount, 0);
  const totalArea = regions.reduce((sum, r) => sum + area(r.boundingBox), 0);

  const raw = regions.map((r) => {
    const wordShare = totalWords > 0 ? r.wordCount / totalWords : 0;
    const areaShare = totalArea > 0 ? area(r.boundingBox) / totalArea : 0;
    return Math.max(wordShare, areaShare);
  });

  const totalRaw = raw.reduce((sum, w) => sum + w, 0);
  if (totalRaw === 0) {
    return regions.map(() => (regions.length ? 1 / regions.length : 0));
  }
  return raw.map((w) => w / totalRaw);
}

export function computeScore(regions: ScorableRegion[]): {
  score: number;
  weights: number[];
} {
  if (regions.length === 0) return { score: 0, weights: [] };
  const weights = computeWeights(regions);
  const score = Math.round(
    regions.reduce(
      (sum, r, i) => sum + weights[i] * VERDICT_VALUE[r.status] * 100,
      0,
    ),
  );
  return { score, weights };
}

/** Page-level crawler_blocked caps the score at 10. */
export const BLOCKED_SCORE_CAP = 10;
