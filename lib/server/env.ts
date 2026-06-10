import { z } from "zod";

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

export type Env = z.infer<typeof envSchema>;

export const env: Readonly<Env> = Object.freeze(envSchema.parse(process.env));
