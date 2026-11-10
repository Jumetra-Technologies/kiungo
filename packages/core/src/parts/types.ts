/**
 * The part model behind the Component library.
 *
 * One model per part describes it in millimeters: the solids that make up
 * its body, the features a person would point at (pins, ports, LEDs,
 * buttons), and the electrical blocks inside it with the paths current takes
 * between them. Three renderers draw every part from this one description:
 * the 3D model, the top view, and the current-flow view.
 *
 * Coordinates: the part is seen from above. The origin is its top-left
 * corner; x runs right, y runs down the page (towards the viewer's front)
 * and z runs up, out of the board. All lengths are in millimeters.
 */

export type PartGroupId = "boards" | "prototyping" | "sensors" | "outputs" | "displays" | "radios";

export interface PartGroup {
  id: PartGroupId;
  title: string;
  blurb: string;
}

/** A CSS color (hex) or a CSS background for the top face. */
export type Paint = string;

/**
 * What a solid is made of, for the 3D renderer's lighting. Left out, the
 * renderer infers it from the color and the solid's id.
 *   soldermask: the glossy lacquer on a PCB.   epoxy: a chip's matte black body.
 *   plastic: molded parts (headers, buttons, sockets).   metal: steel shells and cans.
 *   gold, tin, copper: plated pins and pads.   rubber: tyres, grommets.
 *   glass: display glass.   clear: LED lenses and other clear plastic.
 *   ceramic: SMD capacitors and resistors.   paper: labels and stickers.
 */
export type Finish =
  | "soldermask"
  | "epoxy"
  | "plastic"
  | "metal"
  | "gold"
  | "tin"
  | "copper"
  | "rubber"
  | "glass"
  | "clear"
  | "ceramic"
  | "paper";

export type Solid =
  | {
      kind: "box";
      id?: string;
      x: number;
      y: number;
      w: number;
      h: number;
      /** Height above the board surface. */
      d: number;
      /** Base height; parts stacked on others start above zero. */
      z?: number;
      top: Paint;
      side?: Paint;
      /** Flat fill for the 2D views when `top` is a gradient. */
      fill?: string;
      radius?: number;
      /** Rows of header holes punched into the top, across the long axis. */
      holes?: { count: number; rows?: number };
      /** Marks a lit element; the color of its glow when powered. */
      glow?: string;
      /** Text printed on the top face. */
      label?: { text: string; size?: number; color?: string };
      finish?: Finish;
    }
  | {
      kind: "cyl";
      id?: string;
      cx: number;
      cy: number;
      r: number;
      d: number;
      z?: number;
      top: Paint;
      side?: Paint;
      fill?: string;
      segments?: number;
      glow?: string;
      finish?: Finish;
      /** The axis it stands along: z (upright, the default), or lying along x or y, centered on (cx, cy) at height z + r. */
      axis?: "x" | "y" | "z";
    }
  | {
      /** A rounded top, built from stacked discs. LEDs, PIR lenses, caps. */
      kind: "dome";
      id?: string;
      cx: number;
      cy: number;
      r: number;
      d: number;
      z?: number;
      color: string;
      glow?: string;
      /** Draw the dome translucent, as clear LED plastic is. */
      clear?: boolean;
      finish?: Finish;
    }
  | {
      /** Vertical pins: header pins, component legs. */
      kind: "pins";
      id?: string;
      x: number;
      y: number;
      count: number;
      pitch: number;
      dir: "x" | "y";
      /** Pin length; negative z lets pins hang below the board. */
      len: number;
      z?: number;
      rows?: number;
      color?: string;
      /** Square pin side. */
      size?: number;
      finish?: Finish;
    }
  | {
      /** Silkscreen text on the board surface. */
      kind: "text";
      /** "screen:N" marks line N of a display's glass, which the lab writes live text into; "screen-demo" is decoration the lab blanks. */
      id?: string;
      x: number;
      y: number;
      text: string;
      size: number;
      color?: string;
      weight?: number;
      rotate?: number;
      z?: number;
      anchor?: "start" | "middle" | "end";
    }
  | {
      /** A flat printed path (trace, outline, marking) on the board surface. */
      kind: "path";
      d: string;
      color?: string;
      width?: number;
      fill?: string;
      z?: number;
    }
  | {
      /** A flat disc on the surface: a pad, a hole, a marking. */
      kind: "disc";
      cx: number;
      cy: number;
      r: number;
      color: string;
      z?: number;
      ring?: { color: string; width: number };
    };

/**
 * How a part sits on the Engineering Lab canvas when it is drawn as itself
 * (no card around it): where each pinout pin's hole is on the board, in mm,
 * so jumper wires land on the real header, and where the USB lead plugs in.
 */
export interface CanvasSpec {
  /** Pinout pin id → hole center on the board (mm, top-left origin). */
  pins: Record<string, { x: number; y: number }>;
  /** The USB socket's mouth: where the lead's plug seats, and the side it comes in from. */
  usb?: { x: number; y: number; z: number; from: "left" | "right" | "top" | "bottom" };
  /** The still 3D view on the canvas, when the default three-quarter view would crowd the holes. */
  view?: { spin: number; tilt: number };
  /** Height (mm) of the hole tops wires land on. Defaults to a female header on a PCB. */
  pinZ?: number;
  /** Also draw the part as itself in the Trace view (a breadboard has too many holes for a card). */
  trace?: boolean;
}

export type FeatureKind =
  | "pin"
  | "pins"
  | "port"
  | "led"
  | "button"
  | "chip"
  | "antenna"
  | "sensor"
  | "connector"
  | "power"
  | "mechanical"
  | "other";

/** Something a person would point at in the top view. */
export interface Feature {
  id: string;
  label: string;
  kind: FeatureKind;
  x: number;
  y: number;
  w: number;
  h: number;
  note: string;
}

export type PinRole =
  | "power"
  | "ground"
  | "digital"
  | "analog"
  | "pwm"
  | "data"
  | "clock"
  | "uart"
  | "spi"
  | "i2c"
  | "mechanical"
  | "other";

export interface PinInfo {
  name: string;
  role: PinRole;
  note: string;
}

export type BlockKind =
  | "pin"
  | "power"
  | "ground"
  | "mcu"
  | "ic"
  | "passive"
  | "sensor"
  | "actuator"
  | "connector"
  | "antenna"
  | "regulator"
  | "driver"
  | "display"
  | "world";

export interface CircuitBlock {
  id: string;
  label: string;
  sub?: string;
  kind: BlockKind;
  col: number;
  row: number;
  note: string;
}

export type LinkKind =
  | "power"
  | "ground"
  | "signal"
  | "data"
  | "analog"
  | "mechanical"
  | "rf"
  | "light"
  | "sound"
  | "physical";

export interface CircuitLink {
  from: string;
  to: string;
  kind: LinkKind;
  label?: string;
  /** Current or data runs both ways. */
  both?: boolean;
}

export interface Circuit {
  blocks: CircuitBlock[];
  links: CircuitLink[];
  /** How it works, one step at a time. */
  steps: string[];
}

export interface Fact {
  label: string;
  value: string;
}

export interface PartModel {
  id: string;
  name: string;
  /** Other names people use for it. */
  aka?: string[];
  group: PartGroupId;
  /** Lower comes first inside its group; 1 is the part most people reach for. */
  rank: number;
  summary: string;
  /** Overall size in mm: footprint and height. */
  size: { w: number; h: number; d: number };
  /**
   * Which face the top view draws. "top" looks down on the part; "front" looks
   * at it standing up, for parts whose face is vertical (LEDs, TO-92 sensors).
   * In a front view, feature y runs down from the top of the part.
   */
  plan?: "top" | "front";
  solids: Solid[];
  features: Feature[];
  pins: PinInfo[];
  circuit: Circuit;
  facts: Fact[];
  /** Ids of solids that light up, turn, or sweep back and forth when the part is powered in the 3D view. */
  animate?: { lit?: string[]; spin?: string[]; sweep?: string[] };
  /** A first experiment worth running with it. */
  experiment: { title: string; idea: string };
  /** Reference article in the Documentation Center, when one exists. */
  docs?: string;
  tags: string[];
  /** Set for parts the lab draws as themselves on the canvas, with wires on their real pins. */
  canvas?: CanvasSpec;
}
