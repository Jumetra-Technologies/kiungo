/**
 * Crash-safe file writes (DSK-13): a power cut or a forced quit leaves either
 * the old file or the new one, never half of one.
 *
 * The new content goes to a temporary file in the same folder, is flushed to
 * the disk, and then renamed over the old file. A rename within one folder
 * replaces the file in a single step on Windows, macOS and Linux. On macOS and
 * Linux the folder is flushed too, so the rename itself survives a power cut.
 */

import { randomBytes } from "node:crypto";
import { mkdir, open, readdir, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

const TMP_MARK = ".kiungo-tmp-";

/** Windows can briefly refuse a rename while an antivirus or indexer has the file open. */
const RETRYABLE = new Set(["EPERM", "EACCES", "EBUSY"]);

async function renameWithRetry(from: string, to: string, platform: NodeJS.Platform): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? "";
      if (platform !== "win32" || !RETRYABLE.has(code) || attempt >= 9) throw error;
      await new Promise((resolve) => setTimeout(resolve, 15 * (attempt + 1)));
    }
  }
}

export async function writeFileAtomic(path: string, data: string | Uint8Array, platform: NodeJS.Platform = process.platform): Promise<void> {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true });
  const tmp = join(dir, `${basename(path)}${TMP_MARK}${randomBytes(6).toString("hex")}`);
  const handle = await open(tmp, "w");
  try {
    await handle.writeFile(data);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await renameWithRetry(tmp, path, platform);
  } catch (error) {
    await rm(tmp, { force: true });
    throw error;
  }
  if (platform !== "win32") {
    // Flush the folder so the rename is on disk too. Not every file system allows it; the write already succeeded.
    try {
      const folder = await open(dir, "r");
      try {
        await folder.sync();
      } finally {
        await folder.close();
      }
    } catch {
      /* best effort */
    }
  }
}

/** Remove temporary files a write left behind when the app was killed mid-write. */
export async function cleanTempFiles(dir: string): Promise<number> {
  let removed = 0;
  try {
    for (const name of await readdir(dir)) {
      if (!name.includes(TMP_MARK)) continue;
      await rm(join(dir, name), { force: true });
      removed++;
    }
  } catch {
    /* the folder may not exist */
  }
  return removed;
}
