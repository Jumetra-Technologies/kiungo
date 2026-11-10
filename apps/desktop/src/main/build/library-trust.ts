/**
 * Libraries this computer has agreed to build with.
 *
 * A library's settings reach the compiler and the linker, so building with
 * one runs what its author wrote, on this computer. Libraries Kiungo itself
 * suggests, and ones the person adds from the Libraries panel, are trusted.
 * A project from someone else that names any other library asks first
 * (main/index.ts shows the question), once per library.
 *
 * Plain Node, no Electron, so it runs in tests.
 */

import { readFile } from "node:fs/promises";
import { HEADER_LIBRARIES, type ProfileLibrary } from "@kiungo/core/build";
import { writeFileAtomic } from "../projects/atomic";

/** Libraries Kiungo suggests by header, and its starters pin. */
export const BUILT_IN_LIBRARIES: readonly string[] = [...new Set(Object.values(HEADER_LIBRARIES).map((l) => l.name))];

const key = (name: string) => name.trim().toLowerCase();

export class LibraryTrust {
  private cache: Set<string> | null = null;

  constructor(private readonly file: string) {}

  private async load(): Promise<Set<string>> {
    if (this.cache) return this.cache;
    const trusted = new Set(BUILT_IN_LIBRARIES.map(key));
    try {
      const raw: unknown = JSON.parse(await readFile(this.file, "utf8"));
      if (Array.isArray(raw)) for (const n of raw) if (typeof n === "string" && n.length <= 100) trusted.add(key(n));
    } catch {
      /* first run, or unreadable: only the built-in list */
    }
    this.cache = trusted;
    return trusted;
  }

  /** The libraries in this list the computer hasn't built with before. */
  async unknown(libraries: readonly ProfileLibrary[]): Promise<ProfileLibrary[]> {
    const trusted = await this.load();
    const seen = new Set<string>();
    return libraries.filter((l) => !trusted.has(key(l.name)) && !seen.has(key(l.name)) && seen.add(key(l.name)));
  }

  async trust(names: readonly string[]): Promise<void> {
    const trusted = await this.load();
    for (const n of names) trusted.add(key(n));
    const builtIn = new Set(BUILT_IN_LIBRARIES.map(key));
    await writeFileAtomic(this.file, `${JSON.stringify([...trusted].filter((n) => !builtIn.has(n)).sort(), null, 2)}\n`);
  }
}
