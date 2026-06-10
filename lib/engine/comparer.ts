import { tokenize } from "./text";
import type {
  Comparison,
  RegionChange,
  RegionResult,
  ScanResult,
  Verdict,
} from "./types";

/**
 * Rescan comparison: score delta plus per-region status changes. Regions are
 * matched on selector first, then on name similarity (token Jaccard ≥ 0.6)
 * for renamed/recaptured regions.
 */

const VERDICT_RANK: Record<Verdict, number> = { bad: 0, warn: 1, ok: 2 };
export const NAME_SIMILARITY_THRESHOLD = 0.6;

export function nameSimilarity(a: string, b: string): number {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let common = 0;
  for (const t of ta) if (tb.has(t)) common++;
  return common / (ta.size + tb.size - common);
}

function changeKind(prev: RegionResult, next: RegionResult): RegionChange["change"] {
  const before = VERDICT_RANK[prev.status];
  const after = VERDICT_RANK[next.status];
  if (after > before) return "improved";
  if (after < before) return "regressed";
  return "unchanged";
}

export function compareScans(
  prev: { id: string; result: ScanResult },
  next: { result: ScanResult },
): Comparison {
  const prevRegions = [...prev.result.regions];
  const nextRegions = [...next.result.regions];
  const changes: RegionChange[] = [];
  const matchedPrev = new Set<number>();

  // Pass 1: exact selector matches.
  const matches: Array<{ prevIdx: number; nextIdx: number }> = [];
  nextRegions.forEach((nr, nextIdx) => {
    const prevIdx = prevRegions.findIndex(
      (pr, i) => !matchedPrev.has(i) && pr.selector === nr.selector,
    );
    if (prevIdx !== -1) {
      matchedPrev.add(prevIdx);
      matches.push({ prevIdx, nextIdx });
    }
  });

  // Pass 2: best name-similarity match for the leftovers.
  const matchedNext = new Set(matches.map((m) => m.nextIdx));
  nextRegions.forEach((nr, nextIdx) => {
    if (matchedNext.has(nextIdx)) return;
    let best = -1;
    let bestScore = 0;
    prevRegions.forEach((pr, i) => {
      if (matchedPrev.has(i)) return;
      const s = nameSimilarity(pr.name, nr.name);
      if (s > bestScore) {
        bestScore = s;
        best = i;
      }
    });
    if (best !== -1 && bestScore >= NAME_SIMILARITY_THRESHOLD) {
      matchedPrev.add(best);
      matches.push({ prevIdx: best, nextIdx });
    }
  });

  for (const { prevIdx, nextIdx } of matches) {
    const pr = prevRegions[prevIdx];
    const nr = nextRegions[nextIdx];
    changes.push({
      selector: nr.selector,
      name: nr.name,
      change: changeKind(pr, nr),
      before: { status: pr.status, issueType: pr.issueType },
      after: { status: nr.status, issueType: nr.issueType },
    });
  }

  const matchedNextAll = new Set(matches.map((m) => m.nextIdx));
  nextRegions.forEach((nr, i) => {
    if (matchedNextAll.has(i)) return;
    changes.push({
      selector: nr.selector,
      name: nr.name,
      change: "new",
      before: null,
      after: { status: nr.status, issueType: nr.issueType },
    });
  });

  prevRegions.forEach((pr, i) => {
    if (matchedPrev.has(i)) return;
    changes.push({
      selector: pr.selector,
      name: pr.name,
      change: "removed",
      before: { status: pr.status, issueType: pr.issueType },
      after: null,
    });
  });

  return {
    prevScanId: prev.id,
    prevScore: prev.result.score,
    nextScore: next.result.score,
    scoreDelta: next.result.score - prev.result.score,
    regions: changes,
  };
}
