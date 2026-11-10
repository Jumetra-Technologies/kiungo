#!/usr/bin/env node
/**
 * Draws the app icons from their SVG sources, at 1024 px with transparent
 * corners: icon.svg → icon.png (Windows, Linux) and icon-mac.svg → icon-mac.png
 * (macOS). electron-builder makes the .ico and .icns from these (electron-builder.yml).
 *
 * Run from the repository root after changing an SVG: node apps/desktop/build/rasterize.mjs
 * (sharp comes with the website's dependencies.)
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
for (const name of ["icon", "icon-mac"]) {
  const svg = readFileSync(join(here, `${name}.svg`));
  const out = join(here, `${name}.png`);
  await sharp(svg, { density: 300 }).resize(1024, 1024).png({ compressionLevel: 9 }).toFile(out);
  console.log(`  ${out}`);
}
