import { useEffect, useState } from "react";
import type { BoardsState } from "@kiungo/api";
import { invoke } from "../ipc";

/** Boards on USB, kept current as they're plugged in and out (HW-01). Null until the first answer. */
export function useBoards(): BoardsState | null {
  const [state, setState] = useState<BoardsState | null>(null);
  useEffect(() => {
    let live = true;
    const stop = window.kiungo.on("boards:changed", (boards) => live && setState((s) => ({ boards, message: s?.message ?? null })));
    void invoke("boards:list")
      .then((s) => live && setState(s))
      .catch(() => live && setState({ boards: [], message: "Kiungo couldn't look for boards." }));
    return () => {
      live = false;
      stop();
    };
  }, []);
  return state;
}
