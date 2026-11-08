// Lightweight structural check for boards/*.json and parts/*.json.
// Full schema validation (Zod) lives in @kiungo/core and arrives with the Part SDK (PRJ-04).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const required = {
  boards: ["id", "name", "fqbn", "clockHz", "flashBytes", "sramBytes", "adcBits", "pins"],
  parts: ["id", "name", "category", "pins"],
};

let failed = false;
for (const [dir, keys] of Object.entries(required)) {
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const path = join(dir, file);
    try {
      const data = JSON.parse(readFileSync(path, "utf8"));
      const missing = keys.filter((k) => !(k in data));
      if (missing.length) throw new Error(`missing keys: ${missing.join(", ")}`);
      console.log(`ok   ${path}`);
    } catch (e) {
      failed = true;
      console.error(`FAIL ${path}: ${e.message}`);
    }
  }
}
process.exit(failed ? 1 : 0);
