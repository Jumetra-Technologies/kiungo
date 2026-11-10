// @vitest-environment node
import { describe, expect, it } from "vitest";
import { HARDWARE_BOARDS, hardwareBoard, uploadTargetsFor } from "../src/hardware/boards";
import { LineSplitter, parsePlotLine } from "../src/hardware/plot";
import { uploadProblem } from "../src/hardware/upload";
import { identifyBoard, usbId, type DetectedBoard } from "../src/hardware/usb";
import { NANO, UNO, maxSketchBytes } from "../src/boards";
import { PROJECT_BOARDS } from "../src/project";

const detected = (over: Partial<DetectedBoard>): DetectedBoard => ({
  port: "/dev/ttyUSB0",
  protocol: "serial",
  usbId: null,
  serialNumber: null,
  matches: [],
  ...over,
});

describe("board definitions (HWT-01)", () => {
  it("limits are the board packages' own", () => {
    const limits = Object.fromEntries(
      HARDWARE_BOARDS.map((b) => [b.id, [b.flashBytes, b.ramBytes]]),
    );
    expect(limits).toEqual({
      uno: [32_256, 2048],
      nano: [30_720, 2048],
      "nano-old": [30_720, 2048],
      mega: [253_952, 8192],
      esp32: [1_310_720, 327_680],
    });
  });

  it("agrees with the emulator's boards", () => {
    expect(maxSketchBytes(UNO)).toBe(hardwareBoard("uno")!.flashBytes);
    expect(maxSketchBytes(NANO)).toBe(hardwareBoard("nano")!.flashBytes);
  });

  it("each pin is listed once, with what it can do", () => {
    for (const board of HARDWARE_BOARDS) {
      const numbers = board.pins.map((p) => p.arduino);
      expect(new Set(numbers).size, board.id).toBe(numbers.length);
      expect(
        board.pins.every((p) => p.functions.length > 0),
        board.id,
      ).toBe(true);
    }
    expect(
      hardwareBoard("uno")!
        .pins.filter((p) => p.functions.includes("pwm"))
        .map((p) => p.arduino),
    ).toEqual([3, 5, 6, 9, 10, 11]);
    expect(hardwareBoard("mega")!.pins).toHaveLength(70);
    expect(
      hardwareBoard("esp32")!
        .pins.filter((p) => p.inputOnly)
        .map((p) => p.arduino),
    ).toEqual([34, 35, 36, 39]);
    expect(hardwareBoard("nano")!.pins.find((p) => p.name === "A6")?.inputOnly).toBe(true);
  });

  it("a project uploads to boards with the same chip", () => {
    expect(uploadTargetsFor("arduino-uno").map((b) => b.id)).toEqual(["uno", "nano", "nano-old"]);
    expect(uploadTargetsFor("arduino-mega").map((b) => b.id)).toEqual(["mega"]);
    expect(uploadTargetsFor("esp32").map((b) => b.id)).toEqual(["esp32"]);
    expect(uploadTargetsFor("led")).toEqual([]);
  });

  it("every project board has an upload target with the same FQBN and board package", () => {
    for (const p of PROJECT_BOARDS) {
      const own = uploadTargetsFor(p.part)[0];
      expect(own.fqbn, p.part).toBe(p.fqbn);
      expect(own.platform, p.part).toEqual(p.platform);
    }
  });
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

describe("upload problems and recovery (BLD-06, FIX-09)", () => {
  // Real avrdude 6.3 and esptool messages.
  const NOT_IN_SYNC =
    "avrdude: stk500_recv(): programmer is not responding\navrdude: stk500_getsync() attempt 10 of 10: not in sync: resp=0x00\nFailed uploading: uploading error: exit status 1";

  it("a Nano clone that doesn't answer: try the old bootloader", () => {
    const p = uploadProblem(NOT_IN_SYNC, "nano", "win32");
    expect(p).toMatchObject({ id: "no-sync", retryWith: "nano-old" });
    expect(p.title).toMatch(/old bootloader/);
  });

  it("a Uno that doesn't answer: check the board, pins 0 and 1, reset, the cable", () => {
    const p = uploadProblem(NOT_IN_SYNC, "uno", "win32");
    expect(p.id).toBe("no-sync");
    expect(p.retryWith).toBeUndefined();
    expect(p.steps.join(" ")).toMatch(/pins 0 and 1/);
    expect(
      uploadProblem(
        "avrdude: stk500v2_ReceiveMessage(): timeout\navrdude: stk500v2_getsync(): timeout communicating with programmer",
        "mega",
        "linux",
      ).id,
    ).toBe("no-sync");
  });

  it("permission on Linux names the dialout group", () => {
    const p = uploadProblem(
      'avrdude: ser_open(): can\'t open device "/dev/ttyACM0": Permission denied',
      "uno",
      "linux",
    );
    expect(p.id).toBe("permission");
    expect(p.steps[0]).toContain("sudo usermod -aG dialout $USER");
  });

  it("a busy port on Windows and Linux", () => {
    expect(
      uploadProblem(
        'avrdude: ser_open(): can\'t open device "\\\\.\\COM3": Access is denied.',
        "uno",
        "win32",
      ).id,
    ).toBe("port-busy");
    expect(
      uploadProblem(
        'avrdude: ser_open(): can\'t open device "/dev/ttyUSB0": Device or resource busy',
        "nano",
        "linux",
      ).id,
    ).toBe("port-busy");
  });

  it("an unplugged board", () => {
    expect(
      uploadProblem(
        'avrdude: ser_open(): can\'t open device "\\\\.\\COM5": The system cannot find the file specified.',
        "uno",
        "win32",
      ).id,
    ).toBe("port-missing");
    expect(
      uploadProblem(
        'avrdude: ser_open(): can\'t open device "/dev/ttyACM0": No such file or directory',
        "uno",
        "linux",
      ).id,
    ).toBe("port-missing");
  });

  it("an ESP32 that needs BOOT held, or is another chip", () => {
    expect(
      uploadProblem(
        "A fatal error occurred: Failed to connect to ESP32: No serial data received.",
        "esp32",
        "win32",
      ).id,
    ).toBe("esp-no-boot-mode");
    expect(
      uploadProblem(
        "A fatal error occurred: Failed to connect to ESP32: Wrong boot mode detected (0x13)! The chip needs to be in download mode.",
        "esp32",
        "linux",
      ).steps[0],
    ).toMatch(/BOOT/);
    expect(
      uploadProblem(
        "A fatal error occurred: This chip is ESP32-S3, not ESP32. Wrong --chip argument?",
        "esp32",
        "darwin",
      ).title,
    ).toBe("This board is ESP32-S3, not the ESP32 the project is for");
  });

  it("anything else still gives steps", () => {
    const p = uploadProblem("something new", "uno", "linux");
    expect(p.id).toBe("unknown");
    expect(p.steps.length).toBeGreaterThan(0);
  });
});

describe("the serial plotter (HW-02)", () => {
  it("reads lines as the Arduino IDE's plotter does", () => {
    expect(parsePlotLine("12")).toEqual({ values: [{ name: "1", value: 12 }] });
    expect(parsePlotLine("1.5 -2,3e2\t4")?.values.map((v) => v.value)).toEqual([1.5, -2, 300, 4]);
    expect(parsePlotLine("temp:21.5 humidity:40")).toEqual({
      values: [
        { name: "temp", value: 21.5 },
        { name: "humidity", value: 40 },
      ],
    });
    expect(parsePlotLine("Distance: 12")).toEqual({ values: [{ name: "Distance", value: 12 }] });
    expect(parsePlotLine("Distance: 20 cm")).toEqual({ values: [{ name: "Distance", value: 20 }] });
    expect(parsePlotLine("23.4 C, humidity: 40")?.values.map((v) => v.value)).toEqual([23.4]);
    expect(parsePlotLine("Nothing in range")).toBeNull();
    expect(parsePlotLine("")).toBeNull();
  });

  it("joins text split across chunks into whole lines", () => {
    const s = new LineSplitter();
    expect(s.push("Hel")).toEqual([]);
    expect(s.push("lo\r\nWor")).toEqual(["Hello"]);
    expect(s.push("ld\n1\n")).toEqual(["World", "1"]);
  });

  it("a board that never sends a newline doesn't grow the buffer forever", () => {
    const s = new LineSplitter();
    expect(s.push("x".repeat(5000))).toHaveLength(1);
  });
});
