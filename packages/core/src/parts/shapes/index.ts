/**
 * Helpers for writing part models: materials, and the shapes that recur
 * across many parts (PCBs, headers, chips, LEDs, screw terminals).
 */

export { PCB_TOP, MATERIAL, shade, flatColor } from "./materials";
export {
  pcb,
  header,
  pinRow,
  SOLDER_STUB,
  maleHeader,
  silk,
  mountHole,
  flatLegs,
  wire,
  pads,
} from "./board";
export { dip, chip, shieldCan, wifiModule, crystal, sot223, qfp } from "./chips";
export {
  smdLed,
  led5mm,
  capacitor,
  screwTerminal,
  tactileButton,
  smd,
  smdRow,
  lyingCylinder,
  trimPot,
} from "./components";
export { microUsb, usbC, usbB, usbA, barrelJack } from "./connectors";
export type { Mouth } from "./connectors";
