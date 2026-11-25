import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

// @kiungo/core, lab and ui are also built into the website (jumetra-frontend), where Next.js's
// lint rules run. Its one rule those packages meet is kept here under the same name, so a
// plain <img> in a shared package is flagged in both repositories and the comments that
// allow one mean the same thing in both.
const nextRulesTheWebsiteHas = {
  rules: {
    "no-img-element": {
      meta: { type: "suggestion", schema: [], messages: { img: "On the website a plain <img> skips Next.js's image handling: use it on purpose, with a comment saying why." } },
      create: (context) => ({
        JSXOpeningElement(node) {
          if (node.name.type === "JSXIdentifier" && node.name.name === "img") context.report({ node, messageId: "img" });
        },
      }),
    },
  },
};

export default defineConfig([
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    plugins: { "@next/next": nextRulesTheWebsiteHas },
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      // What the code was written under in jumetra-frontend (eslint-config-next's TypeScript rules).
      "@typescript-eslint/no-unused-vars": ["warn", { args: "after-used", ignoreRestSiblings: true }],
      "@typescript-eslint/no-unused-expressions": ["error", { allowShortCircuit: true, allowTernary: true, allowTaggedTemplates: true }],
    },
  },
  { files: ["packages/**"], rules: { "@next/next/no-img-element": "warn" } },
  // EMU-04: a simulation is decided by its program, its inputs and its seed, never by
  // the wall clock or Math.random, so the same run can be repeated cycle for cycle.
  {
    files: ["packages/core/src/emulator/**", "packages/core/src/sim/**", "packages/core/src/boards/**"],
    rules: {
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "Use seeded() from @kiungo/core/sim/random so runs repeat." },
        { object: "Date", property: "now", message: "Simulated time comes from CPU cycles or world steps, not the wall clock." },
        { object: "performance", property: "now", message: "Simulated time comes from CPU cycles or world steps, not the wall clock." },
      ],
      "no-restricted-syntax": [
        "error",
        { selector: "NewExpression[callee.name='Date']", message: "Simulated time comes from CPU cycles or world steps, not the wall clock." },
      ],
    },
  },
  globalIgnores(["**/out/**", "**/dist/**", "**/coverage/**", "apps/desktop/build/**", "apps/desktop/resources/**", "firmware/**"]),
]);
