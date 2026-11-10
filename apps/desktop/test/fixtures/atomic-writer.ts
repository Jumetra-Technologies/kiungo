/**
 * Writes a large file over and over with writeFileAtomic until it is killed.
 * test/projects.test.ts kills it mid-write and checks the file is whole.
 */
import { writeFileAtomic } from "../../src/main/projects/atomic";

const target = process.argv[2];
const parts = Array.from({ length: 400 }, (_, i) => ({ id: `n-${i}`, partId: "led", label: `LED ${i}`, x: i * 7, y: i * 3 }));

async function main() {
  process.stdout.write("ready\n");
  for (let n = 0; ; n++) {
    await writeFileAtomic(target, JSON.stringify({ n, parts, padding: "x".repeat(200_000) }));
  }
}

void main();
