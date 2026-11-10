// @vitest-environment node
import { describe, expect, it } from "vitest";
import { identifyBoard, usbId, type DetectedBoard } from "./usb";

const detected = (over: Partial<DetectedBoard>): DetectedBoard => ({
  port: "/dev/ttyUSB0",
  protocol: "serial",
  usbId: null,
  serialNumber: null,
  matches: [],
  ...over,
});

describe("plain names for what's plugged in (HW-01)", () => {
  it("reads USB IDs as Arduino CLI reports them", () => {
    expect(usbId("0x2341", "0x0043")).toBe("2341:0043");
    expect(usbId("0x1A86", "0x7523")).toBe("1a86:7523");
    expect(usbId(undefined, "0x1")).toBeNull();
  });

  it("a genuine board by its USB ID", () => {
    expect(identifyBoard(detected({ usbId: "2341:0043" }))).toEqual({
      name: "Arduino Uno",
      chip: null,
      likely: ["uno"],
      certain: true,
    });
    expect(identifyBoard(detected({ usbId: "2a03:0042" })).likely).toEqual(["mega"]);
  });

  it("a board Arduino CLI recognized", () => {
    expect(
      identifyBoard(
        detected({
          usbId: "2341:8057",
          matches: [{ name: "Arduino Nano 33 IoT", fqbn: "arduino:samd:nano_33_iot" }],
        }),
      ),
    ).toEqual({ name: "Arduino Nano 33 IoT", chip: null, likely: [], certain: true });
  });

  it("a clone by its USB chip, most likely board first", () => {
    expect(identifyBoard(detected({ usbId: "1a86:7523" }))).toEqual({
      name: "USB serial board (CH340)",
      chip: "CH340",
      likely: ["nano-old", "nano", "uno"],
      certain: false,
    });
    expect(identifyBoard(detected({ usbId: "10c4:ea60" })).likely).toEqual(["esp32"]);
    expect(identifyBoard(detected({ usbId: "dead:beef" })).name).toBe(
      "USB serial device (dead:beef)",
    );
    expect(identifyBoard(detected({})).name).toBe("Serial port");
  });
});
