/**
 * Printed detail as textures: the silkscreen, traces and pads on a board
 * (text, path and disc solids), and what's printed or punched into the top of
 * a box (a chip's marking, a header's holes).
 */
import * as THREE from "three";
import type { PartModel, Solid } from "@kiungo/core/parts/types";

type Flat = Extract<Solid, { kind: "text" | "path" | "disc" }>;
type Box = Extract<Solid, { kind: "box" }>;

const FONT = `"Inter Variable", "Inter", ui-sans-serif, system-ui, sans-serif`;
const MONO = `"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace`;

function canvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas === "function") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function texture(c: HTMLCanvasElement | OffscreenCanvas): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c as HTMLCanvasElement);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/** Pixels per mm for printed detail: sharp at the lab's zoom, inside a 4096 px texture. */
function density(w: number, h: number, wanted = 24): number {
  return Math.max(4, Math.min(wanted, 4096 / Math.max(w, h)));
}

/** The flat layers of a model, by height. */
export function flatLayers(model: PartModel, surface: number): Map<number, Flat[]> {
  const layers = new Map<number, Flat[]>();
  for (const solid of model.solids) {
    if (solid.kind !== "text" && solid.kind !== "path" && solid.kind !== "disc") continue;
    const z = solid.z ?? surface;
    const list = layers.get(z);
    if (list) list.push(solid);
    else layers.set(z, [solid]);
  }
  return layers;
}

/** One printed layer as a transparent texture the size of the part's footprint. */
export function layerTexture(model: PartModel, flats: Flat[]): { texture: THREE.CanvasTexture; w: number; h: number } {
  const { w, h } = model.size;
  const k = density(w, h);
  const c = canvas(Math.ceil(w * k), Math.ceil(h * k));
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  g.scale(k, k);
  g.lineCap = "round";
  g.lineJoin = "round";
  for (const f of flats) {
    if (f.kind === "disc") {
      if (f.ring) {
        g.beginPath();
        g.arc(f.cx, f.cy, f.r + f.ring.width, 0, Math.PI * 2);
        g.fillStyle = f.ring.color;
        g.fill();
      }
      g.beginPath();
      g.arc(f.cx, f.cy, f.r, 0, Math.PI * 2);
      g.fillStyle = f.color;
      g.fill();
    } else if (f.kind === "path") {
      const path = new Path2D(f.d);
      if (f.fill && f.fill !== "none") {
        g.fillStyle = f.fill;
        g.fill(path);
      }
      if (f.color !== "none") {
        g.strokeStyle = f.color ?? "#2f8f73";
        g.lineWidth = f.width ?? 0.3;
        g.stroke(path);
      }
    } else {
      g.save();
      g.translate(f.x, f.y);
      if (f.rotate) g.rotate((f.rotate * Math.PI) / 180);
      g.font = `${f.weight ?? 600} ${f.size}px ${FONT}`;
      g.fillStyle = f.color ?? "#e9f1ec";
      g.textAlign = f.anchor === "middle" ? "center" : f.anchor === "end" ? "right" : "left";
      g.textBaseline = "alphabetic";
      g.fillText(f.text, 0, 0);
      g.restore();
    }
  }
  return { texture: texture(c), w, h };
}

/** What's on a box's top face: header holes, a chip's marking. Null when there is nothing. */
export function boxTopTexture(box: Box): THREE.CanvasTexture | null {
  if (!box.holes && !box.label) return null;
  const k = density(box.w, box.h, 40);
  const c = canvas(Math.max(2, Math.ceil(box.w * k)), Math.max(2, Math.ceil(box.h * k)));
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  g.scale(k, k);
  if (box.holes) {
    const long = box.w >= box.h;
    const cols = long ? box.holes.count : box.holes.rows ?? 1;
    const rows = long ? box.holes.rows ?? 1 : box.holes.count;
    const cw = box.w / cols;
    const ch = box.h / rows;
    const side = Math.min(cw, ch) * 0.42;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const x = i * cw + cw / 2;
        const y = j * ch + ch / 2;
        // A square socket going down into the dark: a lit rim, then shadow.
        g.fillStyle = "rgba(255,255,255,0.07)";
        g.fillRect(x - side / 2 - 0.12, y - side / 2 - 0.12, side + 0.24, side + 0.24);
        const grad = g.createLinearGradient(x, y - side / 2, x, y + side / 2);
        grad.addColorStop(0, "#000000");
        grad.addColorStop(1, "#1a1b1e");
        g.fillStyle = grad;
        g.fillRect(x - side / 2, y - side / 2, side, side);
      }
    }
  }
  if (box.label) {
    const size = box.label.size ?? 1.5;
    g.font = `500 ${size}px ${MONO}`;
    g.fillStyle = box.label.color ?? "#a3a7ad";
    g.textAlign = "center";
    g.textBaseline = "middle";
    const lines = box.label.text.split("\n");
    lines.forEach((line, i) => g.fillText(line, box.w / 2, box.h / 2 + (i - (lines.length - 1) / 2) * size * 1.2, box.w * 0.92));
  }
  return texture(c);
}

/** A soft round glow, for lit LEDs. */
let glowTexture: THREE.CanvasTexture | null = null;
export function glowSprite(): THREE.CanvasTexture {
  if (glowTexture) return glowTexture;
  const c = canvas(128, 128);
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.55)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  glowTexture = texture(c);
  return glowTexture;
}
