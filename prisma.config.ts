import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma 7 no longer auto-loads .env or reads the datasource url from the
// schema. The fallback keeps `npm run setup` working before a .env exists.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "file:./dev.db",
  },
});
