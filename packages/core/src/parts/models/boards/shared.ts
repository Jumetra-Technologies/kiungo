import { type CanvasSpec } from "../../types";
import { SOLDER_STUB } from "../../shapes";

/**
 * Where the lab's ESP32 pins are. The DevKit V1 is drawn with the USB jack on
 * the left and the antenna on the right, so the header that reads EN … VIN
 * (antenna end first) runs along the top, VIN nearest the USB, and the one
 * that reads D23 … 3V3 runs along the bottom. EN has no lab pin.
 */
export function esp32Canvas(): CanvasSpec {
  const x = (i: number) => 0.5 + 1.27 + i * 2.54;
  const top = [
    "VIN",
    "GND1",
    "D13",
    "D12",
    "D14",
    "D27",
    "D26",
    "D25",
    "D33",
    "D32",
    "D35",
    "D34",
    "D39",
    "D36",
    "",
  ];
  const bottom = [
    "3V3",
    "GND2",
    "D15",
    "D2",
    "D4",
    "D16",
    "D17",
    "D5",
    "D18",
    "D19",
    "D21",
    "RX",
    "TX",
    "D22",
    "D23",
  ];
  const pins: CanvasSpec["pins"] = {};
  top.forEach((id, i) => id && (pins[id] = { x: x(i), y: 1 + 1.27 }));
  bottom.forEach((id, i) => id && (pins[id] = { x: x(i), y: 24.5 + 1.27 }));
  // Jumpers land on the solder joints: the pin ends poking through the board.
  return {
    pins,
    pinZ: 1.6 + SOLDER_STUB,
    usb: { x: -1.5, y: 11.2 + 2.75, z: 1.6 + 1.4, from: "left" },
  };
}

/**
 * Where the lab's Pico pins are. Drawn with the USB on the left, so pins 1–20
 * (GP0 … GP15) run along the bottom from the USB end and pins 40–21 (VBUS …
 * GP16) along the top. Pads the lab doesn't model (extra GNDs, RUN, 3V3_EN,
 * ADC_VREF) have no pin.
 */
/** Pico pads: 20 per edge on a 0.1" pitch, centered on the 51 mm board. */
export const PICO_PAD_X0 = (51 - 19 * 2.54) / 2;

export function picoCanvas(): CanvasSpec {
  const x = (i: number) => PICO_PAD_X0 + i * 2.54;
  const top = [
    "VBUS",
    "VSYS",
    "GND2",
    "",
    "3V3",
    "",
    "GP28",
    "",
    "GP27",
    "GP26",
    "",
    "GP22",
    "",
    "GP21",
    "GP20",
    "GP19",
    "GP18",
    "",
    "GP17",
    "GP16",
  ];
  const bottom = [
    "GP0",
    "GP1",
    "GND1",
    "GP2",
    "GP3",
    "GP4",
    "GP5",
    "",
    "GP6",
    "GP7",
    "GP8",
    "GP9",
    "",
    "GP10",
    "GP11",
    "GP12",
    "GP13",
    "",
    "GP14",
    "GP15",
  ];
  const pins: CanvasSpec["pins"] = {};
  top.forEach((id, i) => id && (pins[id] = { x: x(i), y: 1.6 }));
  bottom.forEach((id, i) => id && (pins[id] = { x: x(i), y: 19.4 }));
  return { pins, pinZ: 1.6, usb: { x: -1.3, y: 7.75 + 2.75, z: 1.6 + 1.4, from: "left" } };
}
