/**
 * One WebGL renderer for every part on the page. Browsers allow only a few
 * WebGL contexts at a time, and a lab can hold dozens of parts, so each view
 * asks this one to draw its part and copies the picture onto its own canvas.
 *
 * The camera reproduces @kiungo/core/parts/geometry's `project` exactly (an
 * orthographic view turned by spin, then tilt, and lifted by `stageLift`), so
 * a pin drawn here lands on the pixel the lab's wires are attached to.
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { dropBelow, stageLift, type View3D } from "@kiungo/core/parts/geometry";
import type { PartModel } from "@kiungo/core/parts/types";
import { buildPart, setLit, setMotion, type PartObject } from "./scene";

export interface RenderOptions {
  /** Output size in CSS px. */
  width: number;
  height: number;
  /** Pixels per mm. */
  scale: number;
  view: View3D;
  /** Solids lit up (powered LEDs). */
  lit?: Iterable<string>;
  /** Powered: moving parts move. */
  powered?: boolean;
  /** Seconds, for moving parts. */
  time?: number;
  /** Device pixels per CSS px. */
  pixelRatio?: number;
  /** Draw the shadow the part casts on the surface below it. */
  shadow?: boolean;
  /**
   * Center the picture on this point instead of the scene's center: mm, in
   * the screen's directions (x right, y down) from the scene's center, as
   * @kiungo/core/parts/geometry's `project` returns them divided by the scale.
   */
  center?: { x: number; y: number };
}

let shared: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.OrthographicCamera; key: THREE.DirectionalLight; ground: THREE.Mesh } | null = null;
let unavailable = false;

/** Whether this browser can draw parts with WebGL. */
export function webglAvailable(): boolean {
  if (unavailable) return false;
  if (shared) return true;
  try {
    return !!setup();
  } catch {
    unavailable = true;
    return false;
  }
}

function setup() {
  if (shared) return shared;
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: "low-power" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Neutral tone mapping keeps solder-mask colors true (ACES desaturates them).
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environmentIntensity = 0.42;

  // A soft key light from the upper left, as a desk lamp, and a little fill.
  const key = new THREE.DirectionalLight(0xfff8f0, 1.9);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 4;
  scene.add(key, key.target);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6b7078, 0.3));

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.22 }));
  ground.receiveShadow = true;
  scene.add(ground);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 5000);
  camera.matrixAutoUpdate = false;
  shared = { renderer, scene, camera, key, ground };
  return shared;
}

const parts = new WeakMap<PartModel, PartObject>();
/** The 3D object for a model, built once per model object. */
function partFor(model: PartModel): PartObject {
  let part = parts.get(model);
  if (!part) {
    part = buildPart(model);
    parts.set(model, part);
  }
  return part;
}

/**
 * The view matrix that turns model millimeters into the lab's screen: about
 * the board's center, rotateZ(spin) then rotateX(tilt) as CSS composes them,
 * the stage lift, and depth towards the viewer. World y is the model's y
 * flipped, so the matrix flips it back first.
 */
export function viewMatrix(model: PartModel, view: View3D): THREE.Matrix4 {
  const cz = Math.cos((view.spin * Math.PI) / 180);
  const sz = Math.sin((view.spin * Math.PI) / 180);
  const cx = Math.cos((view.tilt * Math.PI) / 180);
  const sx = Math.sin((view.tilt * Math.PI) / 180);
  const hw = model.size.w / 2;
  const hh = model.size.h / 2;
  const lift = stageLift(model, 1);
  // Model coordinates (x, y down, z up) from world (x, -y, z).
  const fromWorld = new THREE.Matrix4().makeScale(1, -1, 1);
  // Screen: x right, y up (three's), depth towards the viewer.
  const toScreen = new THREE.Matrix4().set(
    cz, -sz, 0, -cz * hw + sz * hh,
    -cx * sz, -cx * cz, sx, cx * (sz * hw + cz * hh) - lift,
    sx * sz, sx * cz, cx, -sx * (sz * hw + cz * hh) - 2000,
    0, 0, 0, 1,
  );
  return toScreen.multiply(fromWorld);
}

/** Draw a part into a 2D canvas (sized by the caller in device px). Returns false when WebGL isn't available. */
export function renderPart(model: PartModel, target: HTMLCanvasElement, options: RenderOptions): boolean {
  if (!webglAvailable()) return false;
  const ctx = setup()!;
  const { renderer, scene, camera, key, ground } = ctx;
  const ratio = options.pixelRatio ?? (typeof window !== "undefined" ? Math.min(2, window.devicePixelRatio || 1) : 1);
  const pw = Math.max(1, Math.round(options.width * ratio));
  const ph = Math.max(1, Math.round(options.height * ratio));
  renderer.setPixelRatio(1);
  renderer.setSize(pw, ph, false);

  const part = partFor(model);
  setLit(part, new Set(options.powered === false ? [] : options.lit ?? []));
  setMotion(part, !!options.powered, options.time ?? 0);
  scene.add(part.root);

  // Shadow: a light above and to the left of the part, a ground under its lowest point.
  const { w, h, d } = model.size;
  const reach = Math.hypot(w, h) + d;
  key.position.set(w / 2 - reach * 0.6, -h / 2 + reach * 0.9, reach * 2.2);
  key.target.position.set(w / 2, -h / 2, 0);
  const sc = key.shadow.camera;
  sc.left = -reach;
  sc.right = reach;
  sc.top = reach;
  sc.bottom = -reach;
  sc.near = 0.1;
  sc.far = reach * 6;
  sc.updateProjectionMatrix();
  ground.visible = options.shadow !== false;
  ground.position.set(w / 2, -h / 2, -dropBelow(model) - 0.02);
  ground.scale.set(reach * 3, reach * 3, 1);

  const halfW = options.width / 2 / options.scale;
  const halfH = options.height / 2 / options.scale;
  const ox = options.center?.x ?? 0;
  const oy = options.center?.y ?? 0;
  camera.left = ox - halfW;
  camera.right = ox + halfW;
  camera.top = -oy + halfH;
  camera.bottom = -oy - halfH;
  camera.near = 1;
  camera.far = 4000;
  camera.updateProjectionMatrix();
  camera.matrixWorldInverse.copy(viewMatrix(model, options.view));
  camera.matrixWorld.copy(camera.matrixWorldInverse).invert();

  renderer.render(scene, camera);
  scene.remove(part.root);

  if (target.width !== pw || target.height !== ph) {
    target.width = pw;
    target.height = ph;
  }
  const g = target.getContext("2d");
  if (!g) return false;
  g.clearRect(0, 0, pw, ph);
  g.drawImage(renderer.domElement, 0, 0);
  return true;
}

/** Forget a model's 3D object (a model that will never be drawn again). */
export function releasePart(model: PartModel): void {
  const part = parts.get(model);
  if (part) {
    part.dispose();
    parts.delete(model);
  }
}

export type Face = "top" | "front";

const plans = new WeakMap<PartModel, Map<string, string>>();
let planCanvas: HTMLCanvasElement | null = null;

/**
 * A rectangle of the part seen straight from above ("top": x right, y down,
 * as the model counts) or straight from the front ("front": x right, y down
 * from the part's top, so z = size.d - y), as an image URL to lay into an
 * SVG drawn in the same millimeters. Null without WebGL.
 */
export function planImage(
  model: PartModel,
  face: Face,
  region: { x: number; y: number; w: number; h: number },
  options: { pxPerMm?: number; powered?: boolean; lit?: readonly string[] } = {},
): string | null {
  if (!webglAvailable()) return null;
  const k = Math.min(options.pxPerMm ?? 16, 2400 / Math.max(region.w, region.h));
  const lit = options.powered ? [...(options.lit ?? [])].sort() : [];
  const key = `${face}|${region.x.toFixed(2)},${region.y.toFixed(2)},${region.w.toFixed(2)},${region.h.toFixed(2)}|${k.toFixed(2)}|${lit.join(",")}`;
  let cache = plans.get(model);
  if (!cache) plans.set(model, (cache = new Map()));
  const hit = cache.get(key);
  if (hit) return hit;

  const lift = stageLift(model, 1);
  const cx = region.x + region.w / 2;
  const cy = region.y + region.h / 2;
  // Where the region's center lands on screen (see `project`): from above, (x - w/2, y - h/2 + lift);
  // from the front, a model point at height z lands at y = lift - z, and the region's y is size.d - z.
  const center = face === "top" ? { x: cx - model.size.w / 2, y: cy - model.size.h / 2 + lift } : { x: cx - model.size.w / 2, y: cy - model.size.d + lift };
  planCanvas ??= document.createElement("canvas");
  const ok = renderPart(model, planCanvas, {
    width: region.w * k,
    height: region.h * k,
    scale: k,
    pixelRatio: 1,
    view: face === "top" ? { spin: 0, tilt: 0 } : { spin: 0, tilt: 90 },
    powered: !!options.powered,
    lit,
    center,
  });
  if (!ok) return null;
  const url = planCanvas.toDataURL("image/webp", 0.92);
  cache.set(key, url);
  return url;
}

const thumbs = new WeakMap<PartModel, string>();

/** A small three-quarter picture of the part, for lists and cards (square, transparent). Null without WebGL. */
export function thumbImage(model: PartModel, px = 192): string | null {
  const hit = thumbs.get(model);
  if (hit) return hit;
  if (!webglAvailable()) return null;
  const { w, h, d } = model.size;
  // Fit the turned part, legs and all, inside the square with a little margin.
  const diagonal = Math.hypot(w, h) || 1;
  const depth = (d + dropBelow(model)) * Math.sin((50 * Math.PI) / 180);
  const scale = (px * 0.88) / Math.max(diagonal, diagonal * 0.66 + depth);
  planCanvas ??= document.createElement("canvas");
  const ok = renderPart(model, planCanvas, { width: px, height: px, scale, pixelRatio: 1, view: { spin: -24, tilt: 50 }, powered: false });
  if (!ok) return null;
  const url = planCanvas.toDataURL("image/webp", 0.92);
  thumbs.set(model, url);
  return url;
}
