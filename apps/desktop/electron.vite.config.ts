import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ["@kiungo/core", "@kiungo/protocol"] })],
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ["@kiungo/protocol"] })],
  },
  renderer: {
    resolve: {
      alias: { "@renderer": resolve("src/renderer/src") },
    },
    plugins: [react()],
  },
});
