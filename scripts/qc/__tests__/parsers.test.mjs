import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lintJson, parseJson } from "../checkers/json.mjs";
import { extractComments, scanCStyle, scanHash } from "../lib/comments.mjs";
import { main, parseArgs } from "../qc.mjs";

describe("strict JSON parser", () => {
  it("parses valid documents", () => {
    assert.deepEqual(parseJson('{"a":[1,2.5,-3e2,true,false,null,"x\\n\\u0041"],"b":{}}'), {
      a: [1, 2.5, -300, true, false, null, "x\nA"],
      b: {},
    });
  });

  for (const [name, text] of [
    ["trailing comma in object", '{"a":1,}'],
    ["trailing comma in array", "[1,]"],
    ["single quotes", "{'a':1}"],
    ["unquoted key", "{a:1}"],
    ["missing colon", '{"a" 1}'],
    ["leading zero", "[01]"],
    ["bare plus", "[+1]"],
    ["unterminated string", '{"a":"x}'],
    ["invalid escape", '["\\q"]'],
    ["bad unicode escape", '["\\u12G4"]'],
    ["raw newline in string", '["a\nb"]'],
    ["comment in strict mode", "// c\n{}"],
    ["extra content", "{} {}"],
    ["empty file", "  \n"],
    ["unclosed object", '{"a":1'],
  ]) {
    it(`rejects ${name}`, () => assert.throws(() => parseJson(text)));
  }

  it("reports the line number of a syntax error", () => {
    const [found] = lintJson("a.json", '{\n  "a": 1,\n  "b": ,\n}\n');
    assert.equal(found.rule, "json-syntax");
    assert.equal(found.line, 3);
  });

  it("reports duplicate keys with their line", () => {
    const found = lintJson("a.json", '{\n  "a": 1,\n  "a": 2\n}\n');
    assert.equal(found[0].rule, "json-duplicate-key");
    assert.equal(found[0].line, 3);
  });

  it("accepts comments only in tsconfig files", () => {
    assert.deepEqual(lintJson("tsconfig.json", '{\n // note\n "a": 1 /* x */\n}\n'), []);
    assert.equal(lintJson("other.json", '{\n // note\n "a": 1\n}\n')[0].rule, "json-syntax");
  });

  it("checks package.json hygiene", () => {
    const pkg = (deps) => JSON.stringify({ name: "x", version: "1.0.0", dependencies: deps });
    assert.deepEqual(lintJson("package.json", pkg({ react: "^18.3.1" })), []);
    assert.equal(lintJson("package.json", pkg({ react: "latest" }))[0].rule, "dependency-version");
    assert.equal(
      lintJson("package.json", pkg({ foo: "github:a/b" }))[0].rule,
      "dependency-version",
    );
    assert.equal(
      lintJson("package.json", pkg({ "@kiungo/core": "^1.0.0" }))[0].rule,
      "dependency-version",
    );
    assert.equal(lintJson("package.json", '{"version":"1.0.0"}')[0].rule, "package-json");
  });
});

describe("comment scanners", () => {
  it("separates comments from code and strings, keeping line numbers", () => {
    const { comments, code } = scanCStyle(
      'const a = "// not a comment"; // real\n/* block\n   two */ const b = 1;\n',
    );
    assert.deepEqual(
      comments.map((c) => c.line),
      [1, 2, 3],
    );
    assert.ok(!code.includes("not a comment"));
    assert.ok(code.includes("const b = 1;"));
    assert.equal(code.split("\n").length, 4);
  });

  it("handles escaped quotes and template literals", () => {
    const { comments } = scanCStyle(
      'const a = "say \\"hi\\" // no";\nconst b = `x // no\n y`; // yes\n',
      { templates: true },
    );
    assert.deepEqual(
      comments.map((c) => c.text.trim()),
      ["yes"],
    );
  });

  it("recognises hash comments only outside quotes and after whitespace", () => {
    const found = scanHash(`a="x # no" # yes\necho $# \${#v}\n# whole line\n`);
    assert.deepEqual(
      found.map((c) => [c.line, c.text.trim()]),
      [
        [1, "yes"],
        [3, "whole line"],
      ],
    );
  });

  it("returns null for file types without code comments", () => {
    assert.equal(extractComments("a.json", "{}"), null);
    assert.equal(extractComments("a.md", "# hi"), null);
  });
});

describe("command line", () => {
  it("parses options and rejects unknown ones", () => {
    assert.deepEqual(parseArgs(["--all", "--only", "json,shell", "--format", "github"]).only, [
      "json",
      "shell",
    ]);
    assert.equal(parseArgs(["--changed=origin/dev"]).base, "origin/dev");
    assert.equal(parseArgs(["--"]).all, false);
    assert.throws(() => parseArgs(["--bogus"]), /unknown option/);
    assert.throws(() => parseArgs(["--format", "xml"]), /unknown format/);
    assert.throws(() => parseArgs(["--only", "cobol"]), /unknown checker/);
  });

  it("prints help and exits cleanly", async () => {
    assert.equal(await main(["--help"], process.cwd()), 0);
  });
});
