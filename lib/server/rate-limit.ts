import { registry } from "./registry";

export const RATE_LIMIT = 10;
export const RATE_WINDOW_MS = 60_000;

export interface RateDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

/** Sliding-window limiter: max 10 scans per minute per IP, in memory. */
export function checkRateLimit(ip: string, now = Date.now()): RateDecision {
  const reg = registry();
  const cutoff = now - RATE_WINDOW_MS;
  const stamps = (reg.rate.get(ip) ?? []).filter((t) => t > cutoff);

  if (stamps.length >= RATE_LIMIT) {
    const retryAfterSeconds = Math.ceil((stamps[0] + RATE_WINDOW_MS - now) / 1000);
    reg.rate.set(ip, stamps);
    return { allowed: false, retryAfterSeconds: Math.max(1, retryAfterSeconds) };
  }

  stamps.push(now);
  reg.rate.set(ip, stamps);
  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * X-Forwarded-For is client-spoofable when Specter is exposed directly.
 * Acceptable for the intended local/trusted-proxy deployments (README warns
 * against exposing Specter publicly without revisiting this).
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "local";
}
