import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    coverage: {
      provider: "istanbul",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
      // The QC gate's thresholds (lines / functions / branches / statements).
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
});
