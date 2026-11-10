// @vitest-environment node
import { describe, expect, it } from "vitest";
import { uploadProblem } from "./upload";

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
