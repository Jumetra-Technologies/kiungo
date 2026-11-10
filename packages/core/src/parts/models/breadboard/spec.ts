/** 0.1" pitch. */
export const P = 2.54;

/** Center of column 1. */
export const X0 = 4.42;

/** Terminal rows top to bottom; the channel runs between e and f. */
export const TERMINAL_ROWS = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"] as const;

export type Row = (typeof TERMINAL_ROWS)[number];

export type RailId = "TP" | "TN" | "BN" | "BP";

export interface RailInfo {
  y: number;
  sign: "+" | "−";
  edge: "top" | "bottom";
  label: string;
}

export interface BreadboardHole {
  id: string;
  label: string;
  x: number;
  y: number;
  /** Strip id: holes with the same strip are joined inside the board. */
  strip: string;
  rail?: RailId;
}

/** Everything the lab needs to know about one breadboard's holes. */
export interface BreadboardSpec {
  partId: string;
  columns: number;
  /** Holes per rail; 0 for a mini board with no rails. */
  railHoles: number;
  rails: Partial<Record<RailId, RailInfo>>;
  size: { w: number; h: number; d: number };
  holes: BreadboardHole[];
  strips: string[][];
}

const ROW_STEP: Record<Row, number> = {
  a: 0,
  b: 1,
  c: 2,
  d: 3,
  e: 4,
  f: 7,
  g: 8,
  h: 9,
  i: 10,
  j: 11,
};

function makeSpec(partId: string, columns: number, railHoles: number): BreadboardSpec {
  const withRails = railHoles > 0;
  // Rails take the first 10 mm; a mini starts with row a near the edge.
  const rowA = withRails ? 13.33 : 4.44;
  const rowY = (row: Row) => rowA + ROW_STEP[row] * P;
  const h = withRails ? 54.6 : rowY("j") + 4.44;
  const w = X0 * 2 + (columns - 1) * P;
  const rails: Partial<Record<RailId, RailInfo>> = withRails
    ? {
        TP: { y: 4.44, sign: "+", edge: "top", label: "Top +" },
        TN: { y: 6.98, sign: "−", edge: "top", label: "Top −" },
        BN: { y: 47.62, sign: "−", edge: "bottom", label: "Bottom −" },
        BP: { y: 50.16, sign: "+", edge: "bottom", label: "Bottom +" },
      }
    : {};
  const colX = (col: number) => X0 + (col - 1) * P;
  // Rail holes come in groups of five with a one-hole gap, centered on the terminal columns.
  const slots = railHoles + Math.floor((railHoles - 1) / 5);
  const railX = (n: number) =>
    X0 + ((columns - 1 - (slots - 1)) / 2) * P + (n - 1 + Math.floor((n - 1) / 5)) * P;
  const holes: BreadboardHole[] = [];
  const railRow = (edge: "top" | "bottom") => {
    for (const rail of Object.keys(rails) as RailId[]) {
      const info = rails[rail]!;
      if (info.edge !== edge) continue;
      for (let n = 1; n <= railHoles; n++)
        holes.push({
          id: `${rail}${n}`,
          label: `${info.label} ${n}`,
          x: railX(n),
          y: info.y,
          strip: rail,
          rail,
        });
    }
  };
  railRow("top");
  for (const row of TERMINAL_ROWS) {
    for (let col = 1; col <= columns; col++) {
      holes.push({
        id: `${row}${col}`,
        label: `${row}${col}`,
        x: colX(col),
        y: rowY(row),
        strip: `${"abcde".includes(row) ? "a-e" : "f-j"}:${col}`,
      });
    }
  }
  railRow("bottom");
  const by = new Map<string, string[]>();
  for (const hole of holes) by.set(hole.strip, [...(by.get(hole.strip) ?? []), hole.id]);
  return {
    partId,
    columns,
    railHoles,
    rails,
    size: { w: Number(w.toFixed(2)), h: Number(h.toFixed(2)), d: 8.5 },
    holes,
    strips: [...by.values()],
  };
}

/** Every breadboard the lab knows, by part id. */
export const MINI = makeSpec("breadboard-mini", 17, 0);

export const HALF = makeSpec("breadboard", 30, 25);

export const FULL = makeSpec("breadboard-full", 63, 50);

export const BREADBOARD_SPECS: Record<string, BreadboardSpec> = {
  "breadboard-mini": MINI,
  breadboard: HALF,
  "breadboard-full": FULL,
};

export function breadboardSpec(partId: string): BreadboardSpec | undefined {
  return BREADBOARD_SPECS[partId];
}

/** The half-size board's layout (kept for code written before the other sizes). */
export const BREADBOARD_SIZE = HALF.size;

export const BREADBOARD_COLUMNS = HALF.columns;

export const RAIL_HOLES = HALF.railHoles;

export const RAILS = HALF.rails as Record<RailId, RailInfo>;

export const RAIL_IDS = Object.keys(RAILS) as RailId[];

export const BREADBOARD_HOLES: readonly BreadboardHole[] = HALF.holes;

export const BREADBOARD_STRIPS: readonly string[][] = HALF.strips;

/** A readable name for a strip: "Top + rail", "Column 12, a–e". */
export function stripName(stripId: string): string {
  if (stripId in RAILS) return `${RAILS[stripId as RailId].label} rail`;
  const [half, col] = stripId.split(":");
  return `Column ${col}, ${half === "a-e" ? "a–e" : "f–j"}`;
}
