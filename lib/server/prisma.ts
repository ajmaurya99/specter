import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { env } from "./env";

// Cached on globalThis: dev HMR re-evaluates modules, and route-level
// bundling can duplicate module instances across routes. One client,
// one better-sqlite3 connection, per process.
const KEY = Symbol.for("specter.prisma");

type GlobalWithPrisma = typeof globalThis & { [KEY]?: PrismaClient };

function createClient(): PrismaClient {
  const adapter = new PrismaBetterSqlite3({ url: env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient = ((globalThis as GlobalWithPrisma)[KEY] ??=
  createClient());
