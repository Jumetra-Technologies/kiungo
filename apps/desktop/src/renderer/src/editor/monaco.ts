/**
 * The code editor (EDT-02), bundled with the app so it works offline: the
 * editor core, its find and replace, folding and the rest of the standard
 * features, C++ highlighting for Arduino code, and the editor's worker. No
 * part of it loads from the network.
 */

import "monaco-editor/esm/vs/editor/edcore.main.js";
import "monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution.js";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api.js";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker.js?worker";

declare global {
  interface Window {
    MonacoEnvironment?: { getWorker: (workerId: string, label: string) => Worker };
  }
}

self.MonacoEnvironment = { getWorker: () => new EditorWorker() };

/** Arduino files are C++; notes are plain text. */
export function languageFor(name: string): string {
  return /\.(ino|h|hpp|c|cpp|tpp|ipp|S)$/i.test(name) ? "cpp" : "plaintext";
}

// Colors from the Kiungo theme: teal keywords, amber numbers, navy text on light; the same family on dark.
monaco.editor.defineTheme("kiungo-light", {
  base: "vs",
  inherit: true,
  rules: [
    { token: "keyword", foreground: "077a7d", fontStyle: "bold" },
    { token: "type", foreground: "0b6b94" },
    { token: "number", foreground: "b45309" },
    { token: "string", foreground: "15803d" },
    { token: "comment", foreground: "64748b", fontStyle: "italic" },
    { token: "keyword.directive", foreground: "7c3aed" },
  ],
  colors: {
    "editor.background": "#ffffff",
    "editor.foreground": "#0f172a",
    "editorLineNumber.foreground": "#94a3b8",
    "editorLineNumber.activeForeground": "#077a7d",
    "editor.lineHighlightBackground": "#f1f5f9",
    "editor.selectionBackground": "#c9ecec",
    "editorCursor.foreground": "#077a7d",
  },
});
monaco.editor.defineTheme("kiungo-dark", {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "keyword", foreground: "3cc8c4", fontStyle: "bold" },
    { token: "type", foreground: "7dd3fc" },
    { token: "number", foreground: "f1ab32" },
    { token: "string", foreground: "86efac" },
    { token: "comment", foreground: "8b97a8", fontStyle: "italic" },
    { token: "keyword.directive", foreground: "c4b5fd" },
  ],
  colors: {
    "editor.background": "#141414",
    "editor.foreground": "#f5f5f5",
    "editorLineNumber.foreground": "#5b6472",
    "editorLineNumber.activeForeground": "#3cc8c4",
    "editor.lineHighlightBackground": "#1d1d1d",
    "editor.selectionBackground": "#174a4a",
    "editorCursor.foreground": "#3cc8c4",
  },
});

export { monaco };
