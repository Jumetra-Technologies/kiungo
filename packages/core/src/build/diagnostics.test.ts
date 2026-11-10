// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseDiagnostics } from "./";

/** Real avr-gcc 7.3 output (the compiler in arduino:avr 1.8.6), from the sketches beside each file. */
const fixture = (name: string) =>
  readFileSync(join(__dirname, "../../test/fixtures/gcc", name), "utf8");

const SKETCH_DIR = "/home/ada/Kiungo/Rover/sketch";

const problems = (name: string) => parseDiagnostics(fixture(`${name}.txt`), SKETCH_DIR);

describe("compiler problems mapped to the line (ERR-01)", () => {
  it("names the sketch file, line and column, and leaves out the core's warnings", () => {
    const [p, ...rest] = problems("semicolon");
    expect(rest).toEqual([]);
    expect(p).toMatchObject({
      file: "sketch.ino",
      line: 4,
      column: 1,
      severity: "error",
      message: "expected ';' before '}' token",
    });
  });

  it("keeps GCC's suggestion as a note on the problem", () => {
    const list = problems("casetypo");
    expect(list.map((d) => [d.line, d.message])).toEqual([
      [2, "'serial' was not declared in this scope"],
      [6, "'digitalwrite' was not declared in this scope"],
    ]);
    expect(list[0]!.notes).toEqual([
      { file: "sketch.ino", line: 2, message: "suggested alternative: 'Serial'" },
    ]);
  });

  it("a note in another file says so, with no sketch file", () => {
    const [p] = problems("args");
    expect(p!.notes).toEqual([{ file: null, line: 134, message: "declared here" }]);
  });

  it("an unclosed string is one problem, not a warning and an error", () => {
    const list = problems("string");
    expect(list.filter((d) => d.line === 3)).toHaveLength(1);
    expect(list[0]!.severity).toBe("error");
  });

  it("the sketch folder under another spelling (Windows short names, symlinks)", () => {
    const out =
      "C:/Users/runneradmin/AppData/Local/Temp/k/Rover/sketch/sketch.ino:2:3: error: 'x' was not declared in this scope";
    expect(
      parseDiagnostics(out, [
        "C:\\Users\\RUNNER~1\\AppData\\Local\\Temp\\k\\Rover\\sketch",
        "C:\\Users\\runneradmin\\AppData\\Local\\Temp\\k\\Rover\\sketch",
      ])[0]!.file,
    ).toBe("sketch.ino");
  });

  it("Windows paths, in any case", () => {
    const out =
      "C:\\Users\\Ada\\Documents\\Kiungo\\Rover\\sketch\\sketch.ino:7:3: error: 'x' was not declared in this scope";
    expect(
      parseDiagnostics(out, "c:\\users\\ada\\documents\\kiungo\\rover\\sketch")[0],
    ).toMatchObject({ file: "sketch.ino", line: 7, column: 3 });
  });

  it("linker problems have no line, and are reported once", () => {
    const big = parseDiagnostics(fixture("toobig.txt"), SKETCH_DIR);
    expect(big.map((d) => d.message)).toEqual([
      "/home/ada/.config/Kiungo/builds/prj-1/sketch.ino.elf section `.text' will not fit in region `text'",
      "region `text' overflowed by 9012 bytes",
    ]);
    expect(big.every((d) => d.file === null && d.line === 0)).toBe(true);
    expect(parseDiagnostics(fixture("nosetup.txt"), SKETCH_DIR).map((d) => d.message)).toEqual([
      "undefined reference to `setup()'",
      "undefined reference to `loop()'",
    ]);
  });

  it("Arduino CLI's own 'Sketch too big' becomes a problem", () => {
    const out =
      "Sketch uses 33012 bytes (102%) of program storage space. Maximum is 32256 bytes.\nSketch too big; see https://support.arduino.cc/hc/en-us/articles/360013825179 for tips on reducing it.";
    expect(parseDiagnostics(out, SKETCH_DIR).map((d) => d.message)).toEqual(["Sketch too big"]);
  });
});
