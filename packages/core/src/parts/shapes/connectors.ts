import { type Finish, type Solid } from "../types";
import { MATERIAL, PCB_TOP, STEEL_TOP } from "./materials";

/** Which board edge a connector's opening faces. */
export type Mouth = "left" | "right" | "top" | "bottom";

/**
 * A dark opening (or insert) on one face of a box: the slot of a USB socket,
 * the white tongue of a USB-B. `inset` is how far it sits inside the face,
 * `margin` its border on the face, `lift` its gap above the box's base.
 */
function opening(
  box: { x: number; y: number; w: number; h: number; d: number; z: number },
  mouth: Mouth,
  o: {
    margin: number;
    lift: number;
    height: number;
    depth: number;
    color: string;
    finish?: Finish;
    radius?: number;
  },
): Solid {
  const across = mouth === "left" || mouth === "right" ? box.h : box.w;
  const span = Math.max(0.4, across - o.margin * 2);
  const z = box.z + o.lift;
  const r = o.radius ?? 0.2;
  if (mouth === "left")
    return {
      kind: "box",
      x: box.x - 0.05,
      y: box.y + o.margin,
      w: o.depth,
      h: span,
      d: o.height,
      z,
      top: o.color,
      finish: o.finish,
      radius: r,
    };
  if (mouth === "right")
    return {
      kind: "box",
      x: box.x + box.w + 0.05 - o.depth,
      y: box.y + o.margin,
      w: o.depth,
      h: span,
      d: o.height,
      z,
      top: o.color,
      finish: o.finish,
      radius: r,
    };
  if (mouth === "top")
    return {
      kind: "box",
      x: box.x + o.margin,
      y: box.y - 0.05,
      w: span,
      h: o.depth,
      d: o.height,
      z,
      top: o.color,
      finish: o.finish,
      radius: r,
    };
  return {
    kind: "box",
    x: box.x + o.margin,
    y: box.y + box.h + 0.05 - o.depth,
    w: span,
    h: o.depth,
    d: o.height,
    z,
    top: o.color,
    finish: o.finish,
    radius: r,
  };
}

/** A connector's footprint, turned for the edge it opens on (`long` runs into the board). */
function shell(
  x: number,
  y: number,
  long: number,
  wide: number,
  mouth: Mouth,
): { w: number; h: number } {
  return mouth === "left" || mouth === "right" ? { w: long, h: wide } : { w: wide, h: long };
}

/** Micro-USB socket: a steel shell 5.6 deep, 7.5 wide, 2.8 tall, with its slot on the opening face. */
export function microUsb(x: number, y: number, z = PCB_TOP, mouth: Mouth = "left"): Solid[] {
  const { w, h } = shell(x, y, 5.6, 7.5, mouth);
  const body = { x, y, w, h, d: 2.8, z };
  return [
    {
      kind: "box",
      id: "usb",
      ...body,
      top: STEEL_TOP,
      side: MATERIAL.steelSide,
      fill: MATERIAL.steel,
      radius: 0.6,
      finish: "metal",
    },
    opening(body, mouth, {
      margin: 0.9,
      lift: 0.55,
      height: 1.7,
      depth: 0.5,
      color: "#0c0d0f",
      finish: "plastic",
      radius: 0.5,
    }),
  ];
}

/** USB-C socket: a rounded steel shell with its oval slot. */
export function usbC(x: number, y: number, z = PCB_TOP, mouth: Mouth = "left"): Solid[] {
  const { w, h } = shell(x, y, 7.5, 9, mouth);
  const body = { x, y, w, h, d: 3.2, z };
  return [
    {
      kind: "box",
      id: "usb",
      ...body,
      top: STEEL_TOP,
      side: MATERIAL.steelSide,
      fill: MATERIAL.steel,
      radius: 1.5,
      finish: "metal",
    },
    opening(body, mouth, {
      margin: 0.8,
      lift: 0.5,
      height: 2.2,
      depth: 0.5,
      color: "#0c0d0f",
      finish: "plastic",
      radius: 1,
    }),
  ];
}

/** USB-B socket (Uno, Mega, printers): a tall steel box with its white plastic insert in the opening. */
export function usbB(x: number, y: number, z = PCB_TOP, mouth: Mouth = "left"): Solid[] {
  const { w, h } = shell(x, y, 16.3, 12, mouth);
  const body = { x, y, w, h, d: 10.9, z };
  return [
    {
      kind: "box",
      id: "usb",
      ...body,
      top: STEEL_TOP,
      side: MATERIAL.steelSide,
      fill: MATERIAL.steel,
      radius: 0.5,
      finish: "metal",
    },
    opening(body, mouth, {
      margin: 1.2,
      lift: 1.2,
      height: 8.4,
      depth: 0.6,
      color: "#141518",
      finish: "plastic",
      radius: 0.3,
    }),
    opening(body, mouth, {
      margin: 3.1,
      lift: 3.0,
      height: 4.6,
      depth: 0.9,
      color: "#eceae4",
      finish: "plastic",
      radius: 0.6,
    }),
  ];
}

/** USB-A socket: a steel shell with its plastic tongue (black for USB 2, blue for USB 3). */
export function usbA(
  x: number,
  y: number,
  z = PCB_TOP,
  mouth: Mouth = "left",
  tongue = "#1d1e22",
): Solid[] {
  const { w, h } = shell(x, y, 14.5, 13.5, mouth);
  const body = { x, y, w, h, d: 7, z };
  return [
    {
      kind: "box",
      id: "usb",
      ...body,
      top: STEEL_TOP,
      side: MATERIAL.steelSide,
      fill: MATERIAL.steel,
      radius: 0.5,
      finish: "metal",
    },
    opening(body, mouth, {
      margin: 0.7,
      lift: 0.7,
      height: 5.6,
      depth: 0.5,
      color: "#0c0d0f",
      finish: "plastic",
    }),
    opening(body, mouth, {
      margin: 1.6,
      lift: 3.6,
      height: 1.9,
      depth: 0.8,
      color: tongue,
      finish: "plastic",
    }),
  ];
}

/** DC barrel jack: a black body with the round socket and its center pin on the opening face. */
export function barrelJack(x: number, y: number, z = PCB_TOP, mouth: Mouth = "left"): Solid[] {
  const { w, h } = shell(x, y, 14, 9, mouth);
  const solids: Solid[] = [
    {
      kind: "box",
      id: "jack",
      x,
      y,
      w,
      h,
      d: 11,
      z,
      top: "linear-gradient(180deg,#34363b,#222326)",
      side: "#111214",
      fill: "#2a2c30",
      radius: 0.6,
      finish: "plastic",
    },
  ];
  const cx = x + w / 2;
  const cy = y + h / 2;
  const axis = mouth === "left" || mouth === "right" ? "x" : "y";
  const face =
    mouth === "left"
      ? x - 0.05
      : mouth === "right"
        ? x + w + 0.05
        : mouth === "top"
          ? y - 0.05
          : y + h + 0.05;
  const into = mouth === "left" || mouth === "top" ? 0.4 : -0.4;
  const at = (offset: number) =>
    axis === "x" ? { cx: face + offset, cy } : { cx, cy: face + offset };
  solids.push({
    kind: "cyl",
    ...at(into),
    r: 3.2,
    d: 0.8,
    z: z + 6.5 - 3.2,
    top: "#0b0c0e",
    finish: "plastic",
    axis,
  });
  solids.push({
    kind: "cyl",
    ...at(into * 1.4),
    r: 1.05,
    d: 0.9,
    z: z + 6.5 - 1.05,
    top: "#c9ccd1",
    finish: "metal",
    axis,
  });
  return solids;
}
