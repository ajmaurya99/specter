// Shared shapes for the analysis engine. The engine is pure: no Next.js
// imports anywhere under lib/engine, all IO dependencies are injected.
// Client components may import THIS module (types only) — nothing else.

export type Verdict = "ok" | "warn" | "bad";

export type IssueType =
  | "fully_visible"
  | "js_rendered_content"
  | "data_in_script_variable"
  | "iframe_embed"
  | "canvas_or_image_data"
  | "partial_content"
  | "client_side_routes"
  | "hidden_but_present";

export type EngineErrorType =
  | "invalid_url"
  | "ssrf_blocked"
  | "unsupported_content_type"
  | "timeout"
  | "dns_or_network"
  | "login_redirect"
  | "render_failed";

export type ScanPhase = "fetching" | "rendering" | "diffing" | "classifying";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RegionLink {
  href: string;
  isClientRoute: boolean;
}

export interface RegionFlags {
  hasCanvas: boolean;
  canvasDominant: boolean;
  hasIframe: boolean;
  iframeDominant: boolean;
  iframeSrc: string | null;
  hasTable: boolean;
  imgCount: number;
  imgWithoutAltCount: number;
  imageDominant: boolean;
}

/** A rendered region as captured by the renderer, before diffing. */
export interface RegionCapture {
  selector: string;
  name: string;
  /** Visible text content, whitespace-normalized. */
  text: string;
  wordCount: number;
  boundingBox: Rect;
  flags: RegionFlags;
  links: RegionLink[];
}

export interface HiddenBlock {
  selector: string;
  text: string;
}

export interface RenderResult {
  regions: RegionCapture[];
  hiddenBlocks: HiddenBlock[];
  pageHeight: number;
  requestCount: number;
  title: string;
}

export interface DiffResult {
  /** Fraction of the region's visible text present in the raw HTML text. */
  coverage: number;
  /** Same check against concatenated inline <script> contents. */
  foundInScripts: number;
}

export interface RegionResult {
  selector: string;
  name: string;
  status: Verdict;
  issueType: IssueType;
  coverage: number;
  foundInScripts: number;
  /** Quantified, human-readable proof for the verdict. */
  evidence: string;
  boundingBox: Rect;
  /** Normalized share of the page (sums to 1 across regions). */
  weight: number;
  wordCount: number;
  flags: RegionFlags;
  links: RegionLink[];
  /** Copy-ready fix prompt; present on warn/bad regions. */
  fixPrompt?: string;
}

export interface FetchOutcome {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  contentType: string | null;
  bytes: number;
  html: string;
  redirects: string[];
  durationMs: number;
}

export interface BotBlockVerdict {
  reason: "status" | "challenge" | "divergence";
  crawler: { status: number; bytes: number };
  control: { status: number; bytes: number };
  evidence: string;
  fixPrompt: string;
}

export interface RobotsGridEntry {
  crawler: string;
  allowed: boolean;
}

export interface PageChecks {
  robotsTxt: { present: boolean; grid: RobotsGridEntry[] };
  llmsTxt: { present: boolean; linksToPath: boolean | null };
  hasJsonLd: boolean;
  hasTitle: boolean;
  hasMetaDescription: boolean;
  hasSitemapReference: boolean;
  /** True when the scanned URL itself needs JS routing (e.g. /#/route). */
  requiresJsRouting: boolean;
}

export interface Fingerprint {
  stack: string;
  signals: string[];
}

export interface ScanTelemetry {
  crawlerStatus: number;
  crawlerBytes: number;
  controlStatus: number | null;
  controlBytes: number | null;
  fetchDurationMs: number;
  renderDurationMs: number;
  requestCount: number;
}

export interface ScanResult {
  /** The URL as submitted (after normalization). */
  url: string;
  /** Where the crawler fetch actually landed after redirects. */
  finalUrl: string;
  scannedAt: string;
  score: number;
  blocked: BotBlockVerdict | null;
  stack: Fingerprint;
  regions: RegionResult[];
  pageChecks: PageChecks;
  /**
   * The exact stripped raw-HTML text the differ used — surfaced verbatim in
   * the crawler-view tab as the proof behind every verdict.
   */
  rawText: string;
  telemetry: ScanTelemetry;
  pageHeight: number;
  viewportWidth: number;
  crawlerUserAgent: string;
}

export type RegionChangeKind =
  | "improved"
  | "regressed"
  | "unchanged"
  | "new"
  | "removed";

export interface RegionChange {
  selector: string;
  name: string;
  change: RegionChangeKind;
  before: { status: Verdict; issueType: IssueType } | null;
  after: { status: Verdict; issueType: IssueType } | null;
}

export interface Comparison {
  prevScanId: string;
  prevScore: number;
  nextScore: number;
  scoreDelta: number;
  regions: RegionChange[];
}

export interface ProbeOutcome {
  url: string;
  status: number | null;
  /** True when the probe demonstrably served distinct content. */
  distinctContent: boolean;
}

export type LinkProber = (urls: string[]) => Promise<ProbeOutcome[]>;
