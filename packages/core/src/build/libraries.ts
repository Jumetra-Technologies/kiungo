/**
 * Libraries a sketch builds with (BLD-04, FIX-02).
 *
 * A project pins its libraries in sketch/sketch.yaml, in the `kiungo`
 * profile, so it builds the same on every computer. Arduino CLI writes that
 * list when a library is added (it resolves dependencies too); this reads it
 * back, and knows which library a missing header comes from.
 */

export interface ProfileLibrary {
  name: string;
  version: string;
  /** Needed by another library rather than by the sketch itself. */
  dependency: boolean;
}

export interface SketchProfileInfo {
  fqbn: string | null;
  platforms: Array<{ id: string; version: string | null }>;
  libraries: ProfileLibrary[];
}

const unquote = (s: string) => s.trim().replace(/^(["'])(.*)\1$/, "$2");

/** An item under `platforms:` or `libraries:`, added to `info` when it's one Arduino CLI writes. */
function readItem(info: SketchProfileInfo, section: "platforms" | "libraries", body: string) {
  if (!body.startsWith("- ") && !body.startsWith("platform:")) return;
  const item = body.replace(/^-\s+/, "");
  if (section === "platforms") {
    const p = /^platform:\s*(.+?)(?:\s*\(([^)]+)\))?\s*$/.exec(item);
    if (p && body.startsWith("- "))
      info.platforms.push({ id: unquote(p[1] ?? ""), version: p[2]?.trim() ?? null });
    return;
  }
  const dep = /^dependency:\s*(.+)$/.exec(item);
  if (/^dir:/.test(item)) return;
  const l = /^(.+?)\s*\(([^)]+)\)\s*$/.exec(unquote(dep?.[1] ?? item));
  if (l)
    info.libraries.push({
      name: (l[1] ?? "").trim(),
      version: (l[2] ?? "").trim(),
      dependency: Boolean(dep),
    });
}

interface ProfileReader {
  inProfiles: boolean;
  profileIndent: number;
  inProfile: boolean;
  section: "platforms" | "libraries" | null;
  sectionIndent: number;
}

/** A line inside the profile being read: one of its settings, or an item of its section. */
function readProfileLine(r: ProfileReader, info: SketchProfileInfo, indent: number, body: string) {
  if (r.section && indent > r.sectionIndent) {
    readItem(info, r.section, body);
    return;
  }
  r.section = null;
  const kv = /^([\w_]+):\s*(.*)$/.exec(body);
  if (!kv) return;
  if (kv[1] === "fqbn") info.fqbn = unquote(kv[2] ?? "") || null;
  if ((kv[1] === "platforms" || kv[1] === "libraries") && !kv[2]) {
    r.section = kv[1];
    r.sectionIndent = indent;
  }
}

/** Whether the line names a profile (the first key under profiles); if so the reader moves into it. */
function readProfileName(r: ProfileReader, indent: number, body: string, profile: string): boolean {
  if (r.profileIndent >= 0 && indent !== r.profileIndent) return false;
  if (!/^[\w.-]+:\s*$/.test(body)) return false;
  r.profileIndent = indent;
  r.inProfile = body.slice(0, -1) === profile;
  r.section = null;
  return true;
}

/**
 * Reads one profile from sketch.yaml. Only the shape Arduino CLI writes is
 * understood: block mappings and `- ` lists, two-space indents, no anchors.
 */
export function readSketchProfile(yaml: string, profile = "kiungo"): SketchProfileInfo {
  const info: SketchProfileInfo = { fqbn: null, platforms: [], libraries: [] };
  const r: ProfileReader = {
    inProfiles: false,
    profileIndent: -1,
    inProfile: false,
    section: null,
    sectionIndent: -1,
  };
  for (const raw of yaml.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, "").replace(/^\s*#.*$/, "");
    if (!line.trim()) continue;
    const indent = line.length - line.trimStart().length;
    const body = line.trim();
    if (indent === 0) {
      r.inProfiles = body === "profiles:";
      r.inProfile = false;
      r.section = null;
      continue;
    }
    if (!r.inProfiles || readProfileName(r, indent, body, profile)) continue;
    if (!r.inProfile || indent <= r.profileIndent) continue;
    readProfileLine(r, info, indent, body);
  }
  return info;
}

/** A library worth suggesting by its header, with the name the Arduino library index uses. */
export interface KnownLibrary {
  name: string;
  /** What it's for, in a few words, for the helper. */
  does: string;
}

/**
 * Headers from libraries Kiungo's parts use, and their library. The version
 * isn't pinned here: adding takes the newest from the library index and pins
 * that in the sketch.
 */
export const HEADER_LIBRARIES: Readonly<Record<string, KnownLibrary>> = {
  "Servo.h": { name: "Servo", does: "Turns servo motors to an angle" },
  "DHT.h": {
    name: "DHT sensor library",
    does: "Reads DHT11 and DHT22 temperature and humidity sensors",
  },
  "DHT_U.h": {
    name: "DHT sensor library",
    does: "Reads DHT11 and DHT22 temperature and humidity sensors",
  },
  "Adafruit_Sensor.h": {
    name: "Adafruit Unified Sensor",
    does: "Common sensor types used by Adafruit libraries",
  },
  "LiquidCrystal.h": { name: "LiquidCrystal", does: "Drives character LCDs wired in parallel" },
  "LiquidCrystal_I2C.h": {
    name: "LiquidCrystal I2C",
    does: "Drives character LCDs with an I2C backpack",
  },
  "Adafruit_SSD1306.h": { name: "Adafruit SSD1306", does: "Drives SSD1306 OLED displays" },
  "Adafruit_GFX.h": { name: "Adafruit GFX Library", does: "Text and shapes for Adafruit displays" },
  "Adafruit_NeoPixel.h": { name: "Adafruit NeoPixel", does: "Drives NeoPixel (WS2812) LED strips" },
  "Stepper.h": { name: "Stepper", does: "Drives stepper motors" },
  "IRremote.h": { name: "IRremote", does: "Sends and receives infrared remote codes" },
  "IRremote.hpp": { name: "IRremote", does: "Sends and receives infrared remote codes" },
  "MFRC522.h": { name: "MFRC522", does: "Reads RFID cards with an RC522 reader" },
  "NewPing.h": { name: "NewPing", does: "Reads HC-SR04 and other ultrasonic distance sensors" },
  "OneWire.h": { name: "OneWire", does: "Talks to 1-Wire devices" },
  "DallasTemperature.h": { name: "DallasTemperature", does: "Reads DS18B20 temperature sensors" },
  "RTClib.h": { name: "RTClib", does: "Reads real-time clock modules such as the DS3231" },
};

/** Headers that come with the AVR board package: never a missing library on an Uno or a Mega. */
export const BUILT_IN_HEADERS = new Set([
  "Arduino.h",
  "Wire.h",
  "SPI.h",
  "EEPROM.h",
  "SoftwareSerial.h",
  "HID.h",
  "avr/pgmspace.h",
  "avr/io.h",
  "avr/interrupt.h",
  "util/delay.h",
]);

/** The library a header comes from, if Kiungo knows it. */
export function libraryForHeader(header: string): KnownLibrary | null {
  const base = header.replace(/\\/g, "/").split("/").pop() ?? header;
  return HEADER_LIBRARIES[header] ?? HEADER_LIBRARIES[base] ?? null;
}

/** Library names are matched without case, as Arduino CLI does. */
export function hasLibrary(libraries: readonly ProfileLibrary[], name: string): boolean {
  return libraries.some((l) => l.name.toLowerCase() === name.toLowerCase());
}
