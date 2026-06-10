import { describe, expect, it } from "vitest";
import {
  BLOCKED_SCORE_CAP,
  computeScore,
  computeWeights,
} from "@/lib/engine/scorer";
import type { Rect, Verdict } from "@/lib/engine/types";

function region(wordCount: number, area: Rect, status: Verdict) {
  return { wordCount, boundingBox: area, status };
}

const rect = (width: number, height: number): Rect => ({ x: 0, y: 0, width, height });

describe("computeWeights", () => {
  it("normalizes to sum 1", () => {
    const weights = computeWeights([
      { wordCount: 100, boundingBox: rect(100, 1) },
      { wordCount: 0, boundingBox: rect(100, 100) },
      { wordCount: 50, boundingBox: rect(10, 10) },
    ]);
    expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it("applies the area floor for big empty interactive regions", () => {
    // A: all the words, tiny area. B: zero words, huge area (empty canvas shell).
    const weights = computeWeights([
      { wordCount: 100, boundingBox: rect(10, 10) },
      { wordCount: 0, boundingBox: rect(100, 100) },
    ]);
    // B must still carry significant weight despite zero words.
    expect(weights[1]).toBeGreaterThan(0.4);
  });

  it("splits evenly when there is no signal at all", () => {
    const weights = computeWeights([
      { wordCount: 0, boundingBox: rect(0, 0) },
      { wordCount: 0, boundingBox: rect(0, 0) },
    ]);
    expect(weights).toEqual([0.5, 0.5]);
  });
});

describe("computeScore", () => {
  it("hand-computed: equal regions ok+bad → 50", () => {
    const { score } = computeScore([
      region(100, rect(100, 100), "ok"),
      region(100, rect(100, 100), "bad"),
    ]);
    expect(score).toBe(50);
  });

  it("hand-computed: ok+warn+bad equal thirds → 50", () => {
    const { score } = computeScore([
      region(50, rect(100, 100), "ok"),
      region(50, rect(100, 100), "warn"),
      region(50, rect(100, 100), "bad"),
    ]);
    expect(score).toBe(50);
  });

  it("hand-computed area-floor case", () => {
    // A: 100 words, 100px². B: empty 10000px² canvas shell, bad.
    // rawA = max(1, 100/10100) = 1 ; rawB = max(0, 10000/10100) ≈ 0.9901
    // normalized: A ≈ 0.50249, B ≈ 0.49751 → score = round(50.249) = 50
    const { score } = computeScore([
      region(100, rect(10, 10), "ok"),
      region(0, rect(100, 100), "bad"),
    ]);
    expect(score).toBe(50);
  });

  it("returns 0 for an empty page", () => {
    expect(computeScore([]).score).toBe(0);
  });

  it("all-green page scores 100", () => {
    const { score } = computeScore([
      region(10, rect(50, 50), "ok"),
      region(90, rect(500, 500), "ok"),
    ]);
    expect(score).toBe(100);
  });

  it("blocked cap constant matches the spec", () => {
    expect(BLOCKED_SCORE_CAP).toBe(10);
  });
});
