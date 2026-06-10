import { describe, expect, it } from "vitest";
import { z } from "zod";

// The env schema itself lives in lib/server/env.ts, which parses
// process.env at import time; mirror its shape here to test the parsing
// rules without mutating the test process environment.
const envSchema = z.object({
  DATABASE_URL: z.string().default("file:./dev.db"),
  ALLOW_LOCAL_TARGETS: z.stringbool().default(false),
  CRAWLER_USER_AGENT: z.string().default("GPTBot/1.0"),
  SCAN_TIMEOUT_MS: z.coerce.number().int().positive().default(25000),
  ANTHROPIC_API_KEY: z
    .string()
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
});

describe("env schema", () => {
  it("applies spec defaults when unset", () => {
    const env = envSchema.parse({});
    expect(env.DATABASE_URL).toBe("file:./dev.db");
    expect(env.ALLOW_LOCAL_TARGETS).toBe(false);
    expect(env.CRAWLER_USER_AGENT).toBe("GPTBot/1.0");
    expect(env.SCAN_TIMEOUT_MS).toBe(25000);
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("parses boolean and numeric strings", () => {
    const env = envSchema.parse({
      ALLOW_LOCAL_TARGETS: "true",
      SCAN_TIMEOUT_MS: "10000",
    });
    expect(env.ALLOW_LOCAL_TARGETS).toBe(true);
    expect(env.SCAN_TIMEOUT_MS).toBe(10000);
  });

  it("treats an empty ANTHROPIC_API_KEY as absent", () => {
    expect(envSchema.parse({ ANTHROPIC_API_KEY: "" }).ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("rejects a non-numeric timeout", () => {
    expect(() => envSchema.parse({ SCAN_TIMEOUT_MS: "soon" })).toThrow();
  });
});
