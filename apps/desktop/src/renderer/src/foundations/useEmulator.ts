import { useCallback, useEffect, useRef, useState } from "react";
import { LEVEL_NAMES, PIN_SLOTS, type FromWorker, type PinLevel, type ToWorker } from "@kiungo/core/emulator/protocol";
import EmulatorWorker from "@kiungo/core/emulator/worker?worker";

export interface EmulatorState {
  loaded: boolean;
  running: boolean;
  programBytes: number;
  simMs: number;
  speedPercent: number;
  serial: string;
  error: string | null;
  /** True when pin levels come through shared memory instead of messages. */
  sharedPins: boolean;
}

const INITIAL: EmulatorState = { loaded: false, running: false, programBytes: 0, simMs: 0, speedPercent: 0, serial: "", error: null, sharedPins: false };
const SERIAL_KEEP = 4000;

/** One emulated board in a worker, with pin levels read every frame. */
export function useEmulator(watchPins: readonly number[]) {
  const [state, setState] = useState<EmulatorState>(INITIAL);
  const [levels, setLevels] = useState<Record<number, PinLevel>>({});
  const worker = useRef<Worker | null>(null);
  const shared = useRef<Uint8Array | null>(null);
  const fallback = useRef<Record<number, PinLevel>>({});
  const watched = useRef(watchPins);

  useEffect(() => {
    const w = new EmulatorWorker();
    worker.current = w;
    w.onmessage = (event: MessageEvent<FromWorker>) => {
      const m = event.data;
      if (m.type === "loaded") setState((s) => ({ ...s, loaded: true, programBytes: m.programBytes, simMs: 0, serial: "", error: null }));
      else if (m.type === "status") setState((s) => ({ ...s, running: m.running, simMs: m.simMs, speedPercent: m.speedPercent }));
      else if (m.type === "serial") setState((s) => ({ ...s, serial: (s.serial + m.text).slice(-SERIAL_KEEP) }));
      else if (m.type === "error") setState((s) => ({ ...s, error: m.message, running: false }));
      else if (m.type === "pins") for (const c of m.changes) fallback.current[c.pin] = c.level;
    };
    let frame = 0;
    const tick = () => {
      const next: Record<number, PinLevel> = {};
      for (const pin of watched.current) {
        next[pin] = shared.current ? LEVEL_NAMES[shared.current[pin]] ?? "input" : fallback.current[pin] ?? "input";
      }
      setLevels((prev) => (watched.current.every((p) => prev[p] === next[p]) ? prev : next));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      w.terminate();
    };
  }, []);

  const send = (message: ToWorker) => worker.current?.postMessage(message);

  const load = useCallback((hex: string, board: "uno" | "nano" = "uno") => {
    const canShare = typeof SharedArrayBuffer !== "undefined" && self.crossOriginIsolated;
    const buffer = canShare ? new SharedArrayBuffer(PIN_SLOTS) : undefined;
    shared.current = buffer ? new Uint8Array(buffer) : null;
    fallback.current = {};
    setState((s) => ({ ...s, sharedPins: Boolean(buffer), loaded: false, running: false }));
    send({ type: "load", board, hex, pins: buffer });
  }, []);
  const start = useCallback(() => send({ type: "start" }), []);
  const stop = useCallback(() => send({ type: "stop" }), []);

  return { state, levels, load, start, stop };
}
