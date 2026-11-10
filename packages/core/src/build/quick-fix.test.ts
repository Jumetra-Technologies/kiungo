// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyEdits, explain, parseDiagnostics, quickFix, type Diagnostic } from "./";

/** Real avr-gcc 7.3 output (the compiler in arduino:avr 1.8.6), from the sketches beside each file. */
const fixture = (name: string) =>
  readFileSync(join(__dirname, "../../test/fixtures/gcc", name), "utf8");

const SKETCH_DIR = "/home/ada/Kiungo/Rover/sketch";

const problems = (name: string) => parseDiagnostics(fixture(`${name}.txt`), SKETCH_DIR);

const fixed = (name: string, d: Diagnostic, all?: Diagnostic[]) => {
  const source = fixture(`${name}.ino`);
  const fix = quickFix(d, source, all);
  return fix ? applyEdits(source, fix.edits) : null;
};

describe("quick fixes, previewed before they're made (FIX-01)", () => {
  it("adds a missing ; at the end of the line before", () => {
    const [p] = problems("semicolon");
    expect(quickFix(p!, fixture("semicolon.ino"))?.title).toBe("Add the missing ;");
    expect(fixed("semicolon", p!)).toContain("  pinMode(LED, OUTPUT);\n}");
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
    expect(fixed("string", p!)).toContain('  Serial.println("hello");');
  });

  it("closes the function above, and the end-of-file problem goes with it", () => {
    const list = problems("brace");
    expect(fixed("brace", list[0]!, list)).toBe(
      "void setup() {\n  pinMode(13, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(13, HIGH);\n}\n",
    );
    expect(quickFix(list[1]!, fixture("brace.ino"), list)).toBeNull();
  });

  it("a declaration missing its ; (GCC says ',' or ';') gets the same fix", () => {
    const source = "void f() {\n  int times = 2\n}\n";
    const d: Diagnostic = {
      file: "sketch.ino",
      path: "",
      line: 3,
      column: 1,
      severity: "error",
      message: "expected ',' or ';' before '}' token",
      notes: [],
    };
    expect(explain(d)?.id).toBe("missing-semicolon");
    expect(applyEdits(source, quickFix(d, source)!.edits)).toBe(
      "void f() {\n  int times = 2;\n}\n",
    );
    expect(explain({ ...d, message: "expected ';' after struct definition" })?.title).toBe(
      "A ; is missing after the struct",
    );
  });

  it("keeps Windows line endings", () => {
    const source = fixture("brace.ino").replace(/\n/g, "\r\n");
    const list = problems("brace");
    expect(applyEdits(source, quickFix(list[0]!, source, list)!.edits)).toBe(
      "void setup() {\r\n  pinMode(13, OUTPUT);\r\n}\r\n\r\nvoid loop() {\r\n  digitalWrite(13, HIGH);\r\n}\r\n",
    );
  });

  it("a semicolon fix skips a trailing comment", () => {
    const d: Diagnostic = {
      file: "sketch.ino",
      path: "",
      line: 2,
      column: 1,
      severity: "error",
      message: "expected ';' before '}' token",
      notes: [],
    };
    expect(applyEdits("  int x = 1 // one\n}", quickFix(d, "  int x = 1 // one\n}")!.edits)).toBe(
      "  int x = 1; // one\n}",
    );
  });

  it("offers nothing it isn't sure of, or outside the sketch", () => {
    const [args] = problems("args");
    expect(quickFix(args!, fixture("args.ino"))).toBeNull();
    const [big] = parseDiagnostics(fixture("toobig.txt"), SKETCH_DIR);
    expect(quickFix(big!, "")).toBeNull();
  });
});
