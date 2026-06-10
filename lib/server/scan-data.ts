import { z } from "zod";
import type { Comparison, ScanResult } from "@/lib/engine/types";

/**
 * SQLite stores result blobs as opaque JSON; Prisma types them JsonValue.
 * Structural validation at the read boundary catches drift between what an
 * old scan persisted and what the current code expects.
 */

const rectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

const regionSchema = z.looseObject({
  selector: z.string(),
  name: z.string(),
  status: z.enum(["ok", "warn", "bad"]),
  issueType: z.string(),
  coverage: z.number(),
  evidence: z.string(),
  boundingBox: rectSchema,
  weight: z.number(),
  wordCount: z.number(),
  fixPrompt: z.string().optional(),
});

const scanResultSchema = z.looseObject({
  url: z.string(),
  finalUrl: z.string(),
  scannedAt: z.string(),
  score: z.number(),
  regions: z.array(regionSchema),
  rawText: z.string(),
  pageHeight: z.number(),
  viewportWidth: z.number(),
});

const comparisonSchema = z.looseObject({
  prevScanId: z.string(),
  prevScore: z.number(),
  nextScore: z.number(),
  scoreDelta: z.number(),
  regions: z.array(z.looseObject({ selector: z.string(), change: z.string() })),
});

export function parseScanResult(json: unknown): ScanResult | null {
  const parsed = scanResultSchema.safeParse(json);
  return parsed.success ? (parsed.data as unknown as ScanResult) : null;
}

export function parseComparison(json: unknown): Comparison | null {
  if (json === null || json === undefined) return null;
  const parsed = comparisonSchema.safeParse(json);
  return parsed.success ? (parsed.data as unknown as Comparison) : null;
}
