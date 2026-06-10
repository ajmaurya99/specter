import { EventEmitter } from "node:events";
import type { Browser } from "playwright";
import type { Verdict } from "@/lib/engine/types";

/**
 * All long-lived in-process state lives on globalThis under one symbol:
 * dev HMR re-evaluates modules and per-route bundling can duplicate module
 * instances, but globalThis persists for the life of the Node process.
 * Requires exactly one server instance (documented in the README).
 */

export type ScanStatus =
  | "queued"
  | "fetching"
  | "rendering"
  | "diffing"
  | "classifying"
  | "done"
  | "error";

export interface ScanEvent {
  seq: number;
  status: ScanStatus;
  queuePosition?: number;
  telemetry?: Record<string, unknown>;
  score?: number;
  cached?: boolean;
  errorType?: string;
  message?: string;
  /** Sent with the terminal "done" event so skeleton bars can tint. */
  regionVerdicts?: Array<{ selector: string; name: string; status: Verdict }>;
}

export interface QueueState {
  waiting: string[];
  running: Set<string>;
}

export interface Registry {
  emitter: EventEmitter;
  queue: QueueState;
  /** Per-scan replay buffer for SSE (dropped after the scan terminates). */
  events: Map<string, ScanEvent[]>;
  /** Sliding-window rate limiter state, keyed by client IP. */
  rate: Map<string, number[]>;
  browser: Promise<Browser> | null;
  bootDone: boolean;
}

const KEY = Symbol.for("specter.registry");

type GlobalWithRegistry = typeof globalThis & { [KEY]?: Registry };

export function registry(): Registry {
  const g = globalThis as GlobalWithRegistry;
  if (!g[KEY]) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(100); // one listener per open SSE connection
    g[KEY] = {
      emitter,
      queue: { waiting: [], running: new Set() },
      events: new Map(),
      rate: new Map(),
      browser: null,
      bootDone: false,
    };
  }
  return g[KEY];
}

export function scanChannel(scanId: string): string {
  return `scan:${scanId}`;
}

const EVENT_BUFFER_TTL_MS = 5 * 60 * 1000;

/** Append to the replay buffer and notify live SSE subscribers. */
export function publishScanEvent(
  scanId: string,
  event: Omit<ScanEvent, "seq">,
): ScanEvent {
  const reg = registry();
  const buffer = reg.events.get(scanId) ?? [];
  const full: ScanEvent = { ...event, seq: buffer.length + 1 };
  buffer.push(full);
  reg.events.set(scanId, buffer);
  reg.emitter.emit(scanChannel(scanId), full);

  if (full.status === "done" || full.status === "error") {
    const timer = setTimeout(() => reg.events.delete(scanId), EVENT_BUFFER_TTL_MS);
    timer.unref?.();
  }
  return full;
}
