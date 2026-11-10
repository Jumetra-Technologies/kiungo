/** Top of a standard 1.6 mm PCB: where parts on a board sit. */
export const PCB_TOP = 1.6;

export const MATERIAL = {
  pcbGreen: "#1f6b57",
  pcbGreenEdge: "#0f3a2e",
  pcbBlue: "#1d4f91",
  pcbBlueEdge: "#0f2b52",
  /** The teal of a genuine Uno R3. */
  pcbTeal: "#0f8b8e",
  pcbTealEdge: "#085557",
  pcbBlack: "#1f2124",
  pcbBlackEdge: "#0a0b0c",
  pcbRed: "#8e1c2a",
  pcbRedEdge: "#4a0d15",
  pcbPurple: "#4a2a7a",
  pcbPurpleEdge: "#2a1448",
  pcbWhite: "#e9ecef",
  pcbWhiteEdge: "#b9bec4",
  ic: "#1b1c1f",
  icSide: "#0d0e10",
  header: "#141517",
  headerSide: "#090a0b",
  steel: "#c9ccd1",
  steelSide: "#8f949b",
  gold: "#d9b05c",
  silk: "#e9f1ec",
  silkDark: "#f4f6f8",
  plasticBlue: "#2f6fd6",
  plasticWhite: "#eef0f2",
  plasticBlack: "#26272b",
  copper: "#c77e3a",
  tin: "#a7acb3",
} as const;

/** The brushed-steel top of shells and frames. */
export const STEEL_TOP = "linear-gradient(180deg,#d7dadf,#b9bdc3)";

/** Darken or lighten a hex color. factor < 1 darkens. */
export function shade(hex: string, factor: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return hex;
  const value = parseInt(match[1] ?? "", 16);
  const channel = (shift: number) =>
    Math.max(0, Math.min(255, Math.round(((value >> shift) & 255) * factor)));
  return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, "0")).join("")}`;
}

/** The first hex color in a paint string, for flat 2D fills. */
export function flatColor(paint: string): string {
  const match = /#[0-9a-f]{6}/i.exec(paint);
  return match ? match[0] : paint;
}
