// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { explain, parseDiagnostics, quickFix } from "./";

/** Real avr-gcc 7.3 output (the compiler in arduino:avr 1.8.6), from the sketches beside each file. */
const fixture = (name: string) =>
  readFileSync(join(__dirname, "../../test/fixtures/gcc", name), "utf8");

const SKETCH_DIR = "/home/ada/Kiungo/Rover/sketch";

const problems = (name: string) => parseDiagnostics(fixture(`${name}.txt`), SKETCH_DIR);

describe("plain-words explanations (ERR-02)", () => {
  const ids = (name: string) =>
    problems(name).map((d) => explain(d, "the Arduino Uno")?.id ?? null);

  it("covers the common first-sketch mistakes", () => {
    expect(ids("semicolon")).toEqual(["missing-semicolon"]);
    expect(ids("undeclared")).toEqual(["not-declared"]);
    expect(ids("casetypo")).toEqual(["wrong-case", "wrong-case"]);
    expect(ids("header")).toEqual(["missing-library"]);
    expect(ids("brace")).toEqual(["missing-brace", "missing-brace"]);
    expect(ids("args")).toEqual(["wrong-arguments"]);
    expect(ids("string")[0]).toBe("unclosed-text");
    expect(ids("twice")).toEqual(["defined-twice"]);
    expect(parseDiagnostics(fixture("toobig.txt"), SKETCH_DIR).map((d) => explain(d)?.id)).toEqual([
      "too-big",
      "too-big",
    ]);
    expect(parseDiagnostics(fixture("nosetup.txt"), SKETCH_DIR).map((d) => explain(d)?.id)).toEqual(
      ["missing-setup-loop", "missing-setup-loop"],
    );
  });

  it("explains in the sketch's own words", () => {
    const [serial] = problems("casetypo");
    expect(explain(serial!)?.title).toBe("serial should be Serial");
    const [args] = problems("args");
    expect(explain(args!)).toMatchObject({
      title: "pinMode needs more values",
      text: "pinMode takes 2 values, separated by commas: pinMode(uint8_t, uint8_t).",
    });
    const [header] = problems("header");
    expect(explain(header!)).toMatchObject({ header: "Servo.h" });
    const [twice] = problems("twice");
    expect(explain(twice!)?.text).toMatch(/exactly one setup\(\)/);
    const [big] = parseDiagnostics(fixture("toobig.txt"), SKETCH_DIR).slice(1);
    expect(explain(big!, "the Arduino Uno")?.text).toMatch(/^It's 9,012 bytes too big/);
  });

  it("ignores GCC's far-fetched suggestions", () => {
    // GCC offers 'ldiv' for 'ledPin': no fix, and the explanation doesn't repeat it.
    const [p] = problems("undeclared");
    expect(explain(p!)?.title).toBe("ledPin isn't defined");
    expect(quickFix(p!, fixture("undeclared.ino"))).toBeNull();
  });

  it("anything else is left to the compiler's words", () => {
    expect(
      explain({
        file: "sketch.ino",
        path: "",
        line: 1,
        column: 1,
        severity: "error",
        message: "something unusual",
        notes: [],
      }),
    ).toBeNull();
  });
});
