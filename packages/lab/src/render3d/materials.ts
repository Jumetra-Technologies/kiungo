/**
 * Physically based materials for part models: what solder mask, chip epoxy,
 * molded plastic, plated pins and steel shells look like under light.
 */
import * as THREE from "three";
import { flatColor } from "@kiungo/core/parts/build";
import type { Finish, Solid } from "@kiungo/core/parts/types";

type Bodied = Extract<Solid, { kind: "box" | "cyl" | "dome" | "pins" }>;

const METALS = ["#c9ccd1", "#8f949b", "#d7dadf", "#b9bdc3", "#aeb3ba", "#a7acb3", "#9aa0a6"];
const GOLDS = ["#d9b05c", "#c9a24a", "#e2b85c"];
const EPOXY = ["#1b1c1f", "#17181b", "#232428", "#0d0e10"];

function rgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function near(hex: string, list: string[], tolerance = 18): boolean {
  const a = rgb(hex);
  if (!a) return false;
  return list.some((h) => {
    const b = rgb(h)!;
    return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) <= tolerance * 3;
  });
}

/** The plating a flat color stands for, if it's a metal one (pads, rings): null for print. */
export function metalOf(color: string): Finish | null {
  if (near(color, GOLDS)) return "gold";
  if (near(color, ["#a7acb3", "#b3b8be", "#c4c8cd", "#9aa0a6"], 14)) return "tin";
  if (near(color, ["#c77e3a"], 14)) return "copper";
  return null;
}

/** The base color a solid is painted. */
export function baseColor(solid: Bodied): string {
  if (solid.kind === "dome") return solid.color;
  if (solid.kind === "pins") return solid.color ?? "#d9b05c";
  return solid.fill ?? flatColor(solid.top);
}

/** The finish a solid is made of: its own, or one inferred from its id and color. */
export function finishOf(solid: Bodied): Finish {
  if (solid.finish) return solid.finish;
  const color = baseColor(solid);
  if (solid.kind === "pins") return near(color, METALS) ? "tin" : "gold";
  if (solid.kind === "dome") return solid.clear ? "clear" : "plastic";
  if (solid.id === "pcb") return "soldermask";
  if (solid.id === "usb" || solid.id === "shield") return "metal";
  if (near(color, GOLDS)) return "gold";
  if (near(color, METALS)) return "metal";
  if (near(color, EPOXY, 10) && solid.kind === "box" && solid.label) return "epoxy";
  return "plastic";
}

const cache = new Map<string, THREE.MeshPhysicalMaterial>();

/** One shared material per finish and color. */
export function materialFor(finish: Finish, color: string, opts: { emissive?: string; lit?: boolean; opacity?: number } = {}): THREE.MeshPhysicalMaterial {
  const key = `${finish}|${color}|${opts.lit ? opts.emissive : ""}|${opts.opacity ?? 1}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = new THREE.Color(color);
  const m = new THREE.MeshPhysicalMaterial({ color: c });
  switch (finish) {
    case "soldermask":
      // Glossy lacquer over fibreglass: a little sheen, a clear coat.
      Object.assign(m, { roughness: 0.48, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.35 });
      break;
    case "epoxy":
      Object.assign(m, { roughness: 0.78, metalness: 0 });
      break;
    case "plastic":
      Object.assign(m, { roughness: 0.5, metalness: 0, clearcoat: 0.15, clearcoatRoughness: 0.5 });
      break;
    case "metal":
      // Tinned steel: bright, but brushed, so it reflects a blur, not a mirror.
      Object.assign(m, { roughness: 0.5, metalness: 1 });
      m.color = new THREE.Color("#a3a8af");
      break;
    case "gold":
      Object.assign(m, { roughness: 0.3, metalness: 1 });
      m.color = new THREE.Color("#d7a94e");
      break;
    case "tin":
      Object.assign(m, { roughness: 0.38, metalness: 1 });
      m.color = new THREE.Color("#b3b8be");
      break;
    case "copper":
      Object.assign(m, { roughness: 0.3, metalness: 1 });
      m.color = new THREE.Color("#d08a4a");
      break;
    case "rubber":
      Object.assign(m, { roughness: 0.92, metalness: 0 });
      break;
    case "glass":
      Object.assign(m, { roughness: 0.06, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05 });
      break;
    case "clear":
      Object.assign(m, { roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, transparent: true, opacity: opts.opacity ?? 0.55 });
      break;
    case "ceramic":
      Object.assign(m, { roughness: 0.65, metalness: 0 });
      break;
    case "paper":
      Object.assign(m, { roughness: 0.9, metalness: 0 });
      break;
  }
  if (opts.lit && opts.emissive) {
    m.emissive = new THREE.Color(opts.emissive);
    m.emissiveIntensity = 2.2;
  }
  if (opts.opacity !== undefined && opts.opacity < 1) {
    m.transparent = true;
    m.opacity = opts.opacity;
  }
  cache.set(key, m);
  return m;
}
