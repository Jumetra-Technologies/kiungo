import { useId } from "react";
import { cn } from "@kiungo/ui/cn";
import styles from "./usb-cable.module.css";

/** The board end of each board's USB lead. The other end (USB-A) is in the computer, off the canvas. */
export type UsbConnector = "usb-b" | "micro-usb" | "usb-c";

const CONNECTOR: Record<string, UsbConnector> = {
  "arduino-uno": "usb-b",
  "arduino-mega": "usb-b",
  esp32: "micro-usb",
  esp8266: "micro-usb",
  "raspberry-pi-pico": "micro-usb",
  stm32: "micro-usb",
  teensy: "micro-usb",
  microbit: "micro-usb",
  "raspberry-pi-4": "usb-c",
};

export function connectorFor(partId: string): UsbConnector {
  return CONNECTOR[partId] ?? "micro-usb";
}

export const CONNECTOR_NAME: Record<UsbConnector, string> = { "usb-b": "USB-B", "micro-usb": "Micro-USB", "usb-c": "USB-C" };

/** off: no lead · plugging: dropping in, then the click · on: seated and powering · unplugging: pulled out. */
export type PowerState = "off" | "plugging" | "on" | "unplugging";

/**
 * A USB lead plugging into a board when the sketch runs: the cable drops in
 * from above, the plug seats with a little settle and a click (a ring on the
 * port), and 5 V runs down the cable to the board. Drawn as SVG above the
 * part card, so it works in every view.
 */
/** Where the lead's socket point is in the drawing: 166 of 170 viewBox units down, centered. */
const SEAT = { x: 0.5, y: 166 / 170 };
const LEAD = { w: 84, h: 238 };

export function UsbCable({
  connector,
  state,
  anchor,
  socket = true,
}: {
  connector: UsbConnector;
  state: PowerState;
  /**
   * Plug into a point on the part (px from the part's top-left) at an angle
   * (0 = coming down from above, -90 = coming in from the left). Without it,
   * the lead drops into the top edge of a card, with a socket drawn for it.
   */
  anchor?: { x: number; y: number; angle: number };
  /** Draw a socket at the seat; off when the part draws its own jack. */
  socket?: boolean;
}) {
  const fade = useId();
  const placed = anchor
    ? {
        left: anchor.x - LEAD.w * SEAT.x,
        top: anchor.y - LEAD.h * SEAT.y,
        bottom: "auto",
        transform: `rotate(${anchor.angle}deg)`,
        transformOrigin: `${SEAT.x * 100}% ${SEAT.y * 100}%`,
      }
    : undefined;
  // The plug's metal tip and the socket on the card, per connector.
  const tip = connector === "usb-b" ? { w: 16, h: 13 } : connector === "usb-c" ? { w: 14, h: 9 } : { w: 12, h: 7 };
  const body = connector === "usb-b" ? { w: 24, h: 30 } : { w: 18, h: 26 };
  const cx = 30;
  const seatY = 166; // where the tip's end sits, inside the socket at the card's edge
  const tipTop = seatY - tip.h;
  const bodyTop = tipTop - body.h + 2;

  return (
    <div className={styles.lead} style={placed} data-state={state} data-testid="usb-cable" data-connector={connector} data-anchored={anchor ? "true" : undefined} aria-hidden>
      <svg className={styles.svg} viewBox="0 0 60 170" width="84" height="238">
        <defs>
          <linearGradient id={`${fade}-cable`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="140">
            <stop offset="0" stopColor="#2b2f36" stopOpacity="0" />
            <stop offset="0.45" stopColor="#2b2f36" stopOpacity="0" />
            <stop offset="0.68" stopColor="#2b2f36" />
            <stop offset="1" stopColor="#2b2f36" />
          </linearGradient>
          <linearGradient id={`${fade}-fadeMask`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="140">
            <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.7" stopColor="#fff" stopOpacity="1" />
          </linearGradient>
          <mask id={`${fade}-mask`} maskUnits="userSpaceOnUse" x="-20" y="-200" width="100" height="400">
            <rect x="-20" y="-200" width="100" height="400" fill={`url(#${fade}-fadeMask)`} />
          </mask>
          <linearGradient id={`${fade}-metal`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#9aa3ad" />
            <stop offset="0.45" stopColor="#e6eaee" />
            <stop offset="1" stopColor="#8c95a0" />
          </linearGradient>
          <linearGradient id={`${fade}-body`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#1d2026" />
            <stop offset="0.5" stopColor="#3a3f48" />
            <stop offset="1" stopColor="#1a1d22" />
          </linearGradient>
        </defs>

        {/* The socket on the board: always there while the lead is, so the plug has somewhere to go. */}
        <g className={styles.socket}>
          {socket ? (
            <>
              <rect x={cx - tip.w / 2 - 2} y={seatY - 4} width={tip.w + 4} height={8} rx={connector === "usb-c" ? 4 : 1.2} fill="#7d8792" />
              <rect x={cx - tip.w / 2} y={seatY - 3} width={tip.w} height={5} rx={connector === "usb-c" ? 2.5 : 0.8} fill="#2a2e34" />
            </>
          ) : null}
          <circle className={styles.ring} cx={cx} cy={seatY} r={tip.w / 2 + 6} fill="none" stroke="var(--primary)" strokeWidth="2" />
        </g>

        <g className={styles.rig}>
          {/* The cable, coming in from off the canvas. */}
          <path d={`M 18 40 C 18 85, ${cx} 80, ${cx} ${bodyTop + 2}`} fill="none" stroke={`url(#${fade}-cable)`} strokeWidth="7" strokeLinecap="round" />
          <path d={`M 18 40 C 18 85, ${cx} 80, ${cx} ${bodyTop + 2}`} fill="none" stroke="#ffffff" strokeOpacity="0.12" strokeWidth="2" strokeLinecap="round" transform="translate(-1.5 0)" mask={`url(#${fade}-mask)`} />
          {/* Power running down to the board while it's on. */}
          <path className={styles.energy} d={`M 18 40 C 18 85, ${cx} 80, ${cx} ${bodyTop + 2}`} fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" pathLength={100} mask={`url(#${fade}-mask)`} />

          <g className={styles.plug}>
            {/* Strain relief, then the overmould with the USB trident. */}
            <rect x={cx - 5} y={bodyTop - 8} width={10} height={10} rx={2.5} fill="#24282e" />
            <rect x={cx - body.w / 2} y={bodyTop} width={body.w} height={body.h} rx={connector === "usb-b" ? 4 : 3.5} fill={`url(#${fade}-body)`} />
            <g transform={`translate(${cx} ${bodyTop + body.h / 2}) scale(0.55)`} fill="none" stroke="#7f8893" strokeWidth="1.6" strokeLinecap="round">
              <path d="M0 9 V-9 M0 -9 l-3 4 M0 -9 l3 4 M0 4 l-6 -4 v-3 M0 1 l6 -4 v-3" />
              <circle cx="0" cy="10" r="1.8" fill="#7f8893" stroke="none" />
            </g>
            {/* The metal tip, shaped for the connector. */}
            {connector === "usb-b" ? (
              <path d={`M ${cx - tip.w / 2} ${tipTop + 3} L ${cx - tip.w / 2 + 3} ${tipTop} H ${cx + tip.w / 2 - 3} L ${cx + tip.w / 2} ${tipTop + 3} V ${seatY} H ${cx - tip.w / 2} Z`} fill={`url(#${fade}-metal)`} stroke="#6f7883" strokeWidth="0.6" />
            ) : connector === "usb-c" ? (
              <rect x={cx - tip.w / 2} y={tipTop} width={tip.w} height={tip.h} rx={tip.h / 2} fill={`url(#${fade}-metal)`} stroke="#6f7883" strokeWidth="0.6" />
            ) : (
              <path d={`M ${cx - tip.w / 2} ${tipTop} H ${cx + tip.w / 2} V ${seatY - 2} L ${cx + tip.w / 2 - 2} ${seatY} H ${cx - tip.w / 2 + 2} L ${cx - tip.w / 2} ${seatY - 2} Z`} fill={`url(#${fade}-metal)`} stroke="#6f7883" strokeWidth="0.6" />
            )}
          </g>
        </g>
      </svg>
      {anchor ? null : (
        <span className={cn(styles.tag, "font-mono")}>
          {CONNECTOR_NAME[connector]} · 5 V
        </span>
      )}
    </div>
  );
}
