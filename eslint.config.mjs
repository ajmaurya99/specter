import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // eslint-config-next only enables six jsx-a11y rules at warn; the spec
    // requires the full plugin with findings fixed, so run recommended at
    // error severity. The plugin itself is registered by eslint-config-next.
    files: ["**/*.tsx", "**/*.jsx"],
    rules: Object.fromEntries(
      Object.entries(jsxA11y.flatConfigs.recommended.rules)
        .filter(([, value]) => {
          const severity = Array.isArray(value) ? value[0] : value;
          return severity !== "off" && severity !== 0;
        })
        // Bump severity to error but keep each rule's configured options.
        .map(([rule, value]) => [
          rule,
          Array.isArray(value) ? ["error", ...value.slice(1)] : "error",
        ]),
    ),
  },
  {
    // The engine must never reach the client bundle. Client components get
    // plain JSON props and may import types only.
    files: ["components/**/*.{ts,tsx}", "app/**/*.{ts,tsx}"],
    ignores: ["app/api/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/engine/*", "!@/lib/engine/types"],
              message:
                "Engine code is server-only. Import types from @/lib/engine/types or pass data as props.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "lib/generated/**",
    "test-results/**",
    "playwright-report/**",
  ]),
]);

export default eslintConfig;
