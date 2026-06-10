import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    // Engine tests run in node; component tests opt into jsdom with a
    // `// @vitest-environment jsdom` pragma.
    environment: "node",
  },
});
