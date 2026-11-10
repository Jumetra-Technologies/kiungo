/**
 * Boards Kiungo uploads to, with their exact limits and what each pin can do
 * (HWT-01). Limits are the board package's own (`boards.txt` in arduino:avr
 * 1.8.6, esp32 3.3.x for the ESP32 Dev Module with the default partition),
 * not rounded, so the memory meters and the upload check say what the real
 * board says.
 */

export type HardwareBoardId = "uno" | "nano" | "nano-old" | "mega" | "esp32";
export type PinFunction =
  | "digital"
  | "pwm"
  | "analog"
  | "rx"
  | "tx"
  | "sda"
  | "scl"
  | "mosi"
  | "miso"
  | "sck"
  | "ss"
  | "interrupt"
  | "led"
  | "dac"
  | "touch";

export interface HardwarePin {
  /** The label on the board: "D13", "A4", "GPIO2". */
  name: string;
  /** The number Arduino code uses for it. */
  arduino: number;
  functions: PinFunction[];
  /** Why using it can go wrong, when it can. */
  caution?: string;
  /** Input only: pinMode(OUTPUT) does nothing. */
  inputOnly?: boolean;
}

export interface HardwareBoard {
  id: HardwareBoardId;
  name: string;
  /** Arduino's fully qualified board name. */
  fqbn: string;
  /** The board package that builds for it, pinned. */
  platform: { id: string; version: string; indexUrl?: string };
  /** The lab part a project for this board uses. */
  part: string;
  chip: string;
  clockHz: number;
  /** The largest program the board accepts, in bytes (`upload.maximum_size`). */
  flashBytes: number;
  /** Memory for variables, in bytes (`upload.maximum_data_size`). */
  ramBytes: number;
  eepromBytes: number;
  /** Logic level of the pins, in volts. 5 V on a 3.3 V pin damages it. */
  logicVolts: 3.3 | 5;
  ledBuiltin: number;
  uploadTool: "avrdude" | "esptool";
  /** USB IDs of the genuine board, "vid:pid" in lower-case hex. */
  usbIds: string[];
  pins: HardwarePin[];
}

const AVR = { id: "arduino:avr", version: "1.8.6" };

/** The ATmega328P's header pins, as the Uno and the Nano label them. */
function atmega328pPins(nano: boolean): HardwarePin[] {
  const pins: HardwarePin[] = [
    {
      name: "D0",
      arduino: 0,
      functions: ["digital", "rx"],
      caution:
        "Serial receive: used by uploads and the serial monitor. Leave it free if you use Serial.",
    },
    {
      name: "D1",
      arduino: 1,
      functions: ["digital", "tx"],
      caution:
        "Serial transmit: used by uploads and the serial monitor. Leave it free if you use Serial.",
    },
    { name: "D2", arduino: 2, functions: ["digital", "interrupt"] },
    { name: "D3", arduino: 3, functions: ["digital", "pwm", "interrupt"] },
    { name: "D4", arduino: 4, functions: ["digital"] },
    { name: "D5", arduino: 5, functions: ["digital", "pwm"] },
    { name: "D6", arduino: 6, functions: ["digital", "pwm"] },
    { name: "D7", arduino: 7, functions: ["digital"] },
    { name: "D8", arduino: 8, functions: ["digital"] },
    {
      name: "D9",
      arduino: 9,
      functions: ["digital", "pwm"],
      caution: "The Servo library takes over PWM on pins 9 and 10.",
    },
    {
      name: "D10",
      arduino: 10,
      functions: ["digital", "pwm", "ss"],
      caution: "The Servo library takes over PWM on pins 9 and 10.",
    },
    { name: "D11", arduino: 11, functions: ["digital", "pwm", "mosi"] },
    { name: "D12", arduino: 12, functions: ["digital", "miso"] },
    {
      name: "D13",
      arduino: 13,
      functions: ["digital", "sck", "led"],
      caution: "The on-board LED is on this pin, so it flickers during uploads.",
    },
  ];
  for (let n = 0; n < 6; n++) {
    const fn: PinFunction[] = ["analog", "digital"];
    if (n === 4) fn.push("sda");
    if (n === 5) fn.push("scl");
    pins.push({
      name: `A${n}`,
      arduino: 14 + n,
      functions: fn,
      caution: n >= 4 ? "Shared with I2C: not free if a display or sensor uses Wire." : undefined,
    });
  }
  if (nano) {
    pins.push({
      name: "A6",
      arduino: 20,
      functions: ["analog"],
      inputOnly: true,
      caution: "Analog input only: digitalRead and digitalWrite don't work here.",
    });
    pins.push({
      name: "A7",
      arduino: 21,
      functions: ["analog"],
      inputOnly: true,
      caution: "Analog input only: digitalRead and digitalWrite don't work here.",
    });
  }
  return pins;
}

function megaPins(): HardwarePin[] {
  const pins: HardwarePin[] = [];
  const pwm = new Set([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 44, 45, 46]);
  const interrupt = new Set([2, 3, 18, 19, 20, 21]);
  const special: Record<number, PinFunction[]> = {
    0: ["rx"],
    1: ["tx"],
    14: ["tx"],
    15: ["rx"],
    16: ["tx"],
    17: ["rx"],
    18: ["tx"],
    19: ["rx"],
    20: ["sda"],
    21: ["scl"],
    50: ["miso"],
    51: ["mosi"],
    52: ["sck"],
    53: ["ss"],
    13: ["led"],
  };
  for (let n = 0; n <= 53; n++) {
    const fn: PinFunction[] = [
      "digital",
      ...(pwm.has(n) ? (["pwm"] as const) : []),
      ...(interrupt.has(n) ? (["interrupt"] as const) : []),
      ...(special[n] ?? []),
    ];
    pins.push({
      name: `D${n}`,
      arduino: n,
      functions: fn,
      caution:
        n <= 1
          ? "Serial (USB): used by uploads and the serial monitor."
          : n === 20 || n === 21
            ? "I2C: not free if a display or sensor uses Wire."
            : undefined,
    });
  }
  for (let n = 0; n < 16; n++)
    pins.push({ name: `A${n}`, arduino: 54 + n, functions: ["analog", "digital"] });
  return pins;
}

function esp32Pins(): HardwarePin[] {
  const list: Array<[number, PinFunction[], string?, boolean?]> = [
    [
      0,
      ["digital", "touch"],
      "Boot mode pin: held low at power-up it stops the program starting. Avoid for buttons.",
    ],
    [1, ["tx"], "Serial (USB): used by uploads and the serial monitor."],
    [
      2,
      ["digital", "pwm", "analog", "touch", "led"],
      "Boot mode pin and the on-board LED on most boards; must be low or floating at reset.",
    ],
    [3, ["rx"], "Serial (USB): used by uploads and the serial monitor."],
    [4, ["digital", "pwm", "analog", "touch"]],
    [5, ["digital", "pwm", "ss"], "Boot mode pin: sends a signal at power-up."],
    [
      12,
      ["digital", "pwm", "analog", "touch"],
      "Boot mode pin: high at power-up stops the board starting. Avoid pull-ups here.",
    ],
    [13, ["digital", "pwm", "analog", "touch"]],
    [14, ["digital", "pwm", "analog", "touch"], "Sends a signal at power-up."],
    [15, ["digital", "pwm", "analog", "touch"], "Boot mode pin: sends a signal at power-up."],
    [16, ["digital", "pwm", "rx"]],
    [17, ["digital", "pwm", "tx"]],
    [18, ["digital", "pwm", "sck"]],
    [19, ["digital", "pwm", "miso"]],
    [21, ["digital", "pwm", "sda"]],
    [22, ["digital", "pwm", "scl"]],
    [23, ["digital", "pwm", "mosi"]],
    [25, ["digital", "pwm", "analog", "dac"]],
    [26, ["digital", "pwm", "analog", "dac"]],
    [27, ["digital", "pwm", "analog", "touch"]],
    [32, ["digital", "pwm", "analog", "touch"]],
    [33, ["digital", "pwm", "analog", "touch"]],
    [34, ["analog", "digital"], "Input only, with no pull-up or pull-down.", true],
    [35, ["analog", "digital"], "Input only, with no pull-up or pull-down.", true],
    [36, ["analog", "digital"], "Input only, with no pull-up or pull-down.", true],
    [39, ["analog", "digital"], "Input only, with no pull-up or pull-down.", true],
  ];
  return list.map(([n, functions, caution, inputOnly]) => ({
    name: `GPIO${n}`,
    arduino: n,
    functions,
    ...(caution ? { caution } : {}),
    ...(inputOnly ? { inputOnly } : {}),
  }));
}

export const HARDWARE_BOARDS: readonly HardwareBoard[] = [
  {
    id: "uno",
    name: "Arduino Uno",
    fqbn: "arduino:avr:uno",
    platform: AVR,
    part: "arduino-uno",
    chip: "ATmega328P",
    clockHz: 16_000_000,
    flashBytes: 32_256,
    ramBytes: 2048,
    eepromBytes: 1024,
    logicVolts: 5,
    ledBuiltin: 13,
    uploadTool: "avrdude",
    usbIds: ["2341:0043", "2341:0001", "2a03:0043", "2341:0243", "2341:006a"],
    pins: atmega328pPins(false),
  },
  {
    id: "nano",
    name: "Arduino Nano",
    fqbn: "arduino:avr:nano:cpu=atmega328",
    platform: AVR,
    part: "arduino-uno",
    chip: "ATmega328P",
    clockHz: 16_000_000,
    // The IDE keeps 2 KB for the bootloader on the Nano, even with the new one.
    flashBytes: 30_720,
    ramBytes: 2048,
    eepromBytes: 1024,
    logicVolts: 5,
    ledBuiltin: 13,
    uploadTool: "avrdude",
    usbIds: [],
    pins: atmega328pPins(true),
  },
  {
    id: "nano-old",
    name: "Arduino Nano (old bootloader)",
    fqbn: "arduino:avr:nano:cpu=atmega328old",
    platform: AVR,
    part: "arduino-uno",
    chip: "ATmega328P",
    clockHz: 16_000_000,
    flashBytes: 30_720,
    ramBytes: 2048,
    eepromBytes: 1024,
    logicVolts: 5,
    ledBuiltin: 13,
    uploadTool: "avrdude",
    usbIds: [],
    pins: atmega328pPins(true),
  },
  {
    id: "mega",
    name: "Arduino Mega 2560",
    fqbn: "arduino:avr:mega:cpu=atmega2560",
    platform: AVR,
    part: "arduino-mega",
    chip: "ATmega2560",
    clockHz: 16_000_000,
    flashBytes: 253_952,
    ramBytes: 8192,
    eepromBytes: 4096,
    logicVolts: 5,
    ledBuiltin: 13,
    uploadTool: "avrdude",
    usbIds: ["2341:0010", "2341:0042", "2a03:0010", "2a03:0042", "2341:0210", "2341:0242"],
    pins: megaPins(),
  },
  {
    id: "esp32",
    name: "ESP32 Dev Module",
    fqbn: "esp32:esp32:esp32",
    platform: {
      id: "esp32:esp32",
      version: "3.3.12",
      indexUrl: "https://espressif.github.io/arduino-esp32/package_esp32_index.json",
    },
    part: "esp32",
    chip: "ESP32-D0WD",
    clockHz: 240_000_000,
    // The default partition scheme (4 MB with SPIFFS) leaves 1.25 MB for the program.
    flashBytes: 1_310_720,
    ramBytes: 327_680,
    eepromBytes: 0,
    logicVolts: 3.3,
    // Most ESP32 dev boards wire their LED to GPIO2, but this board package doesn't define LED_BUILTIN for them.
    ledBuiltin: 2,
    uploadTool: "esptool",
    usbIds: [],
    pins: esp32Pins(),
  },
];

export function hardwareBoard(id: string): HardwareBoard | undefined {
  return HARDWARE_BOARDS.find((b) => b.id === id);
}

export function hardwareBoardByFqbn(fqbn: string): HardwareBoard | undefined {
  return HARDWARE_BOARDS.find((b) => b.fqbn === fqbn);
}

/**
 * The boards a project can upload to: the same chip as the board the code is
 * written for. A Uno project uploads to a Nano too; a Mega project only to a Mega.
 */
export function uploadTargetsFor(projectPart: string): HardwareBoard[] {
  const own = HARDWARE_BOARDS.find(
    (b) => b.part === projectPart && b.id !== "nano" && b.id !== "nano-old",
  );
  if (!own) return [];
  return HARDWARE_BOARDS.filter((b) => b.chip === own.chip && b.platform.id === own.platform.id);
}
