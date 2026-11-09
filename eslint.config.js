import js from "@eslint/js";
import tseslint from "typescript-eslint";

const nodeGlobals = {
  console: "readonly",
  process: "readonly",
  URL: "readonly",
  Buffer: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
};

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/out/**",
      "**/build/**",
      "**/coverage/**",
      "**/node_modules/**",
      "firmware/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Logic quality: correctness and complexity limits for all code.
    files: ["**/*.{ts,tsx,js,mjs,cjs}"],
    rules: {
      eqeqeq: ["error", "always"],
      "no-var": "error",
      "prefer-const": "error",
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-throw-literal": "error",
      "no-return-await": "error",
      "no-self-compare": "error",
      "no-unreachable-loop": "error",
      "no-constant-binary-expression": "error",
      "no-template-curly-in-string": "error",
      "array-callback-return": "error",
      "default-case-last": "error",
      complexity: ["error", 15],
      "max-depth": ["error", 4],
      "max-params": ["error", 5],
      "no-console": ["error", { allow: ["warn", "error"] }],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Command-line tooling may print and may be a little more branchy.
    files: ["scripts/**/*.mjs"],
    languageOptions: { globals: nodeGlobals },
    rules: {
      "no-console": "off",
      complexity: ["error", 25],
      "max-depth": ["error", 6],
      "max-params": "off",
    },
  },
  {
    files: ["**/*.test.ts"],
    rules: { "max-params": "off" },
  },
);
