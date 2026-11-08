import { create } from "zustand";

interface RunStore {
  state: string;
  version: string | null;
  setState: (s: string) => void;
  setVersion: (v: string) => void;
}

export const useRunStore = create<RunStore>((set) => ({
  state: "idle",
  version: null,
  setState: (state) => set({ state }),
  setVersion: (version) => set({ version }),
}));
