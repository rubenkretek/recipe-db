import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Deliberately minimal, per CLAUDE.md "Testing".
 *
 * Only three modules are ever tested — units.ts, servings.ts and (from Phase 7)
 * shopping-merge.ts — and all three are pure functions with no DOM and no
 * database. So there is no jsdom, no React Testing Library and no setup file:
 * the `node` environment is all that is needed.
 *
 * The `.mts` extension is deliberate. The project has no `"type": "module"`, so
 * a plain `vitest.config.ts` is loaded as CommonJS and warns about its own ESM
 * syntax; `.mts` says "this file is ESM" without changing how every other file
 * in the project is interpreted.
 */
export default defineConfig({
  resolve: {
    // Vitest does not read tsconfig paths, so the `@/` alias has to be repeated
    // here or every import in a test fails to resolve.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/lib/*.test.ts"],
  },
});
