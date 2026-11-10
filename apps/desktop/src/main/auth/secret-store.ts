/**
 * The refresh token, encrypted with the operating system's keychain through
 * Electron's safeStorage: DPAPI on Windows, the Keychain on macOS, the Secret
 * Service (GNOME Keyring, KWallet) on Linux. Where Linux has no keychain,
 * safeStorage falls back to a fixed key, which protects nothing: then the
 * store reports itself not secure and nothing is written (DSK-02).
 */

import { readFile, rm } from "node:fs/promises";
import { safeStorage } from "electron";
import { writeFileAtomic } from "../projects/atomic";
import type { SecretStore } from "./service";

export function keychainStore(file: string): SecretStore {
  const secure = () => {
    if (!safeStorage.isEncryptionAvailable()) return false;
    if (process.platform !== "linux") return true;
    const backend = safeStorage.getSelectedStorageBackend?.();
    return backend !== "basic_text" && backend !== "unknown";
  };
  return {
    secure,
    read: async () => {
      if (!secure()) return null;
      try {
        return safeStorage.decryptString(await readFile(file));
      } catch {
        return null;
      }
    },
    write: async (value) => {
      if (!secure()) return;
      await writeFileAtomic(file, safeStorage.encryptString(value));
    },
    clear: async () => {
      await rm(file, { force: true });
    },
  };
}
