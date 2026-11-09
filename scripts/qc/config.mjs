// Central settings for the quality gate. Change policy here, not inside the checkers.

export const config = {
  // Never scanned.
  ignoreDirs: [
    "node_modules",
    ".git",
    "dist",
    "out",
    "build",
    "release",
    "coverage",
    ".vite",
    ".kiungo",
  ],
  ignoreFiles: ["pnpm-lock.yaml"],

  // Files above this size are rejected (binary blobs and generated output do not belong in git).
  maxFileBytes: 1_000_000,

  // Unfinished-work markers. Any of these inside a code comment is an error.
  // Upper-case-only words are matched case-sensitively to avoid flagging ordinary prose.
  markers: /\b(?:[Tt][Oo][Dd][Oo]|[Ff][Ii][Xx][Mm][Ee]|NOCOMMIT|HACK|XXX|TBD)\b/,

  // The QC tool itself must be able to talk about the markers.
  markerExemptPaths: ["scripts/qc/"],

  // Folders where every source module must have a sibling *.test.ts file.
  testsRequiredIn: ["packages/core/src", "packages/protocol/src"],
  testsNotRequiredFor: ["index.ts"],

  // Source file length limit (lines) for TS/JS.
  maxSourceLines: 500,

  // Where console.log style output is acceptable (CLI scripts and tests).
  consoleAllowedPaths: ["scripts/"],

  // Firmware rules (HWT-02, HWT-05).
  firmware: {
    shimDir: "firmware/shim/",
    symbolPrefixes: ["kg_", "KG_", "__wrap_", "__real_"],
    cppFlags: [
      "-std=gnu++11",
      "-Wall",
      "-Wextra",
      "-Wpedantic",
      "-Werror",
      "-Wshadow",
      "-Wconversion",
      "-Wundef",
      "-Wcast-qual",
    ],
    cFlags: ["-std=gnu11", "-Wall", "-Wextra", "-Wpedantic", "-Werror", "-Wshadow", "-Wconversion"],
    // Hybrid-layer flash and RAM budgets are enforced by the build pipeline (HWT-05); this is
    // the ceiling for the host-side object file as a sanity check on accidental bloat.
    maxShimObjectBytes: 16_384,
  },
};
