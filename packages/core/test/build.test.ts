// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyEdits, explain, libraryForHeader, parseDiagnostics, quickFix, readSketchProfile, type Diagnostic } from "../src/build";
import { PROJECT_BOARDS, sketchProfile } from "../src/project";

/** Real avr-gcc 7.3 output (the compiler in arduino:avr 1.8.6), from the sketches beside each file. */
const fixture = (name: string) => readFileSync(join(__dirname, "fixtures/gcc", name), "utf8");
const SKETCH_DIR = "/home/ada/Kiungo/Rover/sketch";
const problems = (name: string) => parseDiagnostics(fixture(`${name}.txt`), SKETCH_DIR);
const fixed = (name: string, d: Diagnostic, all?: Diagnostic[]) => {
  const source = fixture(`${name}.ino`);
  const fix = quickFix(d, source, all);
  return fix ? applyEdits(source, fix.edits) : null;
};

describe("compiler problems mapped to the line (ERR-01)", () => {
  it("names the sketch file, line and column, and leaves out the core's warnings", () => {
    const [p, ...rest] = problems("semicolon");
    expect(rest).toEqual([]);
    expect(p).toMatchObject({ file: "sketch.ino", line: 4, column: 1, severity: "error", message: "expected ';' before '}' token" });
  });

  it("keeps GCC's suggestion as a note on the problem", () => {
    const list = problems("casetypo");
    expect(list.map((d) => [d.line, d.message])).toEqual([
      [2, "'serial' was not declared in this scope"],
      [6, "'digitalwrite' was not declared in this scope"],
    ]);
    expect(list[0].notes).toEqual([{ file: "sketch.ino", line: 2, message: "suggested alternative: 'Serial'" }]);
  });

  it("a note in another file says so, with no sketch file", () => {
    const [p] = problems("args");
    expect(p.notes).toEqual([{ file: null, line: 134, message: "declared here" }]);
  });

  it("an unclosed string is one problem, not a warning and an error", () => {
    const list = problems("string");
    expect(list.filter((d) => d.line === 3)).toHaveLength(1);
    expect(list[0].severity).toBe("error");
  });

  it("the sketch folder under another spelling (Windows short names, symlinks)", () => {
    const out = "C:/Users/runneradmin/AppData/Local/Temp/k/Rover/sketch/sketch.ino:2:3: error: 'x' was not declared in this scope";
    expect(parseDiagnostics(out, ["C:\\Users\\RUNNER~1\\AppData\\Local\\Temp\\k\\Rover\\sketch", "C:\\Users\\runneradmin\\AppData\\Local\\Temp\\k\\Rover\\sketch"])[0].file).toBe("sketch.ino");
  });

  it("Windows paths, in any case", () => {
    const out = "C:\\Users\\Ada\\Documents\\Kiungo\\Rover\\sketch\\sketch.ino:7:3: error: 'x' was not declared in this scope";
    expect(parseDiagnostics(out, "c:\\users\\ada\\documents\\kiungo\\rover\\sketch")[0]).toMatchObject({ file: "sketch.ino", line: 7, column: 3 });
  });

  it("linker problems have no line, and are reported once", () => {
    const big = parseDiagnostics(fixture("toobig.txt"), SKETCH_DIR);
    expect(big.map((d) => d.message)).toEqual(["/home/ada/.config/Kiungo/builds/prj-1/sketch.ino.elf section `.text' will not fit in region `text'", "region `text' overflowed by 9012 bytes"]);
    expect(big.every((d) => d.file === null && d.line === 0)).toBe(true);
    expect(parseDiagnostics(fixture("nosetup.txt"), SKETCH_DIR).map((d) => d.message)).toEqual(["undefined reference to `setup()'", "undefined reference to `loop()'"]);
  });

  it("Arduino CLI's own 'Sketch too big' becomes a problem", () => {
    const out = "Sketch uses 33012 bytes (102%) of program storage space. Maximum is 32256 bytes.\nSketch too big; see https://support.arduino.cc/hc/en-us/articles/360013825179 for tips on reducing it.";
    expect(parseDiagnostics(out, SKETCH_DIR).map((d) => d.message)).toEqual(["Sketch too big"]);
  });
});

describe("plain-words explanations (ERR-02)", () => {
  const ids = (name: string) => problems(name).map((d) => explain(d, "the Arduino Uno")?.id ?? null);

  it("covers the common first-sketch mistakes", () => {
    expect(ids("semicolon")).toEqual(["missing-semicolon"]);
    expect(ids("undeclared")).toEqual(["not-declared"]);
    expect(ids("casetypo")).toEqual(["wrong-case", "wrong-case"]);
    expect(ids("header")).toEqual(["missing-library"]);
    expect(ids("brace")).toEqual(["missing-brace", "missing-brace"]);
    expect(ids("args")).toEqual(["wrong-arguments"]);
    expect(ids("string")[0]).toBe("unclosed-text");
    expect(ids("twice")).toEqual(["defined-twice"]);
    expect(parseDiagnostics(fixture("toobig.txt"), SKETCH_DIR).map((d) => explain(d)?.id)).toEqual(["too-big", "too-big"]);
    expect(parseDiagnostics(fixture("nosetup.txt"), SKETCH_DIR).map((d) => explain(d)?.id)).toEqual(["missing-setup-loop", "missing-setup-loop"]);
  });

  it("explains in the sketch's own words", () => {
    const [serial] = problems("casetypo");
    expect(explain(serial)?.title).toBe("serial should be Serial");
    const [args] = problems("args");
    expect(explain(args)).toMatchObject({ title: "pinMode needs more values", text: "pinMode takes 2 values, separated by commas: pinMode(uint8_t, uint8_t)." });
    const [header] = problems("header");
    expect(explain(header)).toMatchObject({ header: "Servo.h" });
    const [twice] = problems("twice");
    expect(explain(twice)?.text).toMatch(/exactly one setup\(\)/);
    const [big] = parseDiagnostics(fixture("toobig.txt"), SKETCH_DIR).slice(1);
    expect(explain(big, "the Arduino Uno")?.text).toMatch(/^It's 9,012 bytes too big/);
  });

  it("ignores GCC's far-fetched suggestions", () => {
    // GCC offers 'ldiv' for 'ledPin': no fix, and the explanation doesn't repeat it.
    const [p] = problems("undeclared");
    expect(explain(p)?.title).toBe("ledPin isn't defined");
    expect(quickFix(p, fixture("undeclared.ino"))).toBeNull();
  });

  it("anything else is left to the compiler's words", () => {
    expect(explain({ file: "sketch.ino", path: "", line: 1, column: 1, severity: "error", message: "something unusual", notes: [] })).toBeNull();
  });
});

describe("quick fixes, previewed before they're made (FIX-01)", () => {
  it("adds a missing ; at the end of the line before", () => {
    const [p] = problems("semicolon");
    expect(quickFix(p, fixture("semicolon.ino"))?.title).toBe("Add the missing ;");
    expect(fixed("semicolon", p)).toContain("  pinMode(LED, OUTPUT);\n}");
  });

  it("fixes the capital letters GCC points to", () => {
    const list = problems("casetypo");
    let source = fixture("casetypo.ino");
    for (const d of list) source = applyEdits(source, quickFix(d, source)!.edits);
    expect(source).toContain("  Serial.begin(9600);");
    expect(source).toContain("  digitalWrite(13, HIGH);");
  });

  it("closes an unclosed string before the )", () => {
    const [p] = problems("string");
    expect(fixed("string", p)).toContain('  Serial.println("hello");');
  });

  it("closes the function above, and the end-of-file problem goes with it", () => {
    const list = problems("brace");
    expect(fixed("brace", list[0], list)).toBe("void setup() {\n  pinMode(13, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(13, HIGH);\n}\n");
    expect(quickFix(list[1], fixture("brace.ino"), list)).toBeNull();
  });

  it("a declaration missing its ; (GCC says ',' or ';') gets the same fix", () => {
    const source = "void f() {\n  int times = 2\n}\n";
    const d: Diagnostic = { file: "sketch.ino", path: "", line: 3, column: 1, severity: "error", message: "expected ',' or ';' before '}' token", notes: [] };
    expect(explain(d)?.id).toBe("missing-semicolon");
    expect(applyEdits(source, quickFix(d, source)!.edits)).toBe("void f() {\n  int times = 2;\n}\n");
    expect(explain({ ...d, message: "expected ';' after struct definition" })?.title).toBe("A ; is missing after the struct");
  });

  it("keeps Windows line endings", () => {
    const source = fixture("brace.ino").replace(/\n/g, "\r\n");
    const list = problems("brace");
    expect(applyEdits(source, quickFix(list[0], source, list)!.edits)).toBe("void setup() {\r\n  pinMode(13, OUTPUT);\r\n}\r\n\r\nvoid loop() {\r\n  digitalWrite(13, HIGH);\r\n}\r\n");
  });

  it("a semicolon fix skips a trailing comment", () => {
    const d: Diagnostic = { file: "sketch.ino", path: "", line: 2, column: 1, severity: "error", message: "expected ';' before '}' token", notes: [] };
    expect(applyEdits("  int x = 1 // one\n}", quickFix(d, "  int x = 1 // one\n}")!.edits)).toBe("  int x = 1; // one\n}");
  });

  it("offers nothing it isn't sure of, or outside the sketch", () => {
    const [args] = problems("args");
    expect(quickFix(args, fixture("args.ino"))).toBeNull();
    const [big] = parseDiagnostics(fixture("toobig.txt"), SKETCH_DIR);
    expect(quickFix(big, "")).toBeNull();
  });
});

describe("libraries (BLD-04, FIX-02)", () => {
  it("reads back the profile Kiungo writes", () => {
    const yaml = sketchProfile(PROJECT_BOARDS[0], [
      { name: "DHT sensor library", version: "1.4.7" },
      { name: "Adafruit Unified Sensor", version: "1.1.15", dependency: true },
    ]);
    expect(readSketchProfile(yaml)).toEqual({
      fqbn: "arduino:avr:uno",
      platforms: [{ id: "arduino:avr", version: "1.8.6" }],
      libraries: [
        { name: "DHT sensor library", version: "1.4.7", dependency: false },
        { name: "Adafruit Unified Sensor", version: "1.1.15", dependency: true },
      ],
    });
  });

  it("reads the profile Arduino CLI rewrites, and only the one asked for", () => {
    const yaml = [
      "profiles:",
      "  other:",
      "    fqbn: arduino:avr:nano",
      "    libraries:",
      "      - Nope (1.0.0)",
      "  kiungo:",
      "    fqbn: arduino:avr:mega:cpu=atmega2560",
      "    platforms:",
      "      - platform: arduino:avr (1.8.6)",
      "    libraries:",
      "      - LiquidCrystal I2C (1.1.2)  # the display",
      "      - dir: ../my-lib",
      "default_profile: kiungo",
    ].join("\r\n");
    expect(readSketchProfile(yaml)).toEqual({
      fqbn: "arduino:avr:mega:cpu=atmega2560",
      platforms: [{ id: "arduino:avr", version: "1.8.6" }],
      libraries: [{ name: "LiquidCrystal I2C", version: "1.1.2", dependency: false }],
    });
  });

  it("a missing header names its library", () => {
    expect(libraryForHeader("Servo.h")?.name).toBe("Servo");
    expect(libraryForHeader("DHT.h")?.name).toBe("DHT sensor library");
    expect(libraryForHeader("LiquidCrystal_I2C.h")?.name).toBe("LiquidCrystal I2C");
    expect(libraryForHeader("nope.h")).toBeNull();
  });
});
