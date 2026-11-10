import { type Solid } from "../../types";
import { MATERIAL, silk } from "../../shapes";

/** The snake-shaped light-sensitive track printed on a photoresistor face. */
export function serpentine(cx: number, cy: number, r: number): Solid {
  const rows = 7;
  const gap = (r * 1.7) / (rows - 1);
  let d = "";
  for (let i = 0; i < rows; i++) {
    const y = cy - r * 0.85 + i * gap;
    const half = Math.sqrt(Math.max(0, r * r - (y - cy) * (y - cy))) - 0.35;
    const x1 = cx - half;
    const x2 = cx + half;
    d +=
      i === 0
        ? `M ${x1.toFixed(2)} ${y.toFixed(2)} L ${x2.toFixed(2)} ${y.toFixed(2)}`
        : i % 2 === 1
          ? ` L ${x2.toFixed(2)} ${y.toFixed(2)} L ${x1.toFixed(2)} ${y.toFixed(2)}`
          : ` L ${x1.toFixed(2)} ${y.toFixed(2)} L ${x2.toFixed(2)} ${y.toFixed(2)}`;
  }
  return { kind: "path", d, color: "#3b2f2a", width: 0.3, z: 2.05 };
}

/** The white DHT22 / AM2302 housing lying on its back, slots up. */
export function dhtHousing(label: string): Solid[] {
  const slots: Solid[] = Array.from(
    { length: 6 },
    (_, i) =>
      ({
        kind: "box",
        x: 2.3,
        y: 5 + i * 2.6,
        w: 10.5,
        h: 1.1,
        d: 0.25,
        z: 7.5,
        top: "#8e949b",
        side: "#6b7280",
        radius: 0.5,
      }) as Solid,
  );
  return [
    {
      kind: "box",
      id: "body",
      x: 0,
      y: 0,
      w: 15.1,
      h: 25.1,
      d: 7.7,
      top: MATERIAL.plasticWhite,
      side: "#c5c9ce",
      radius: 1,
    },
    ...slots,
    { kind: "disc", cx: 7.55, cy: 2.3, r: 1.2, color: "#5b6066", z: 7.7 },
    silk({
      x: 7.55,
      y: 23.6,
      text: label,
      size: 1.4,
      color: "#6b7280",
      extra: { anchor: "middle", z: 7.7, weight: 600 },
    }),
  ];
}

export const DHT_STEPS_11 = [
  "Your board pulls DATA low for at least 18 ms to ask for a reading, then releases the line.",
  "The chip inside measures the resistive humidity film and the NTC thermistor and converts both to numbers.",
  "It answers on the same wire with 40 bits: humidity, temperature and a checksum, each bit told apart by pulse length.",
  "One reading a second at most; the library you use handles the timing for you.",
];
