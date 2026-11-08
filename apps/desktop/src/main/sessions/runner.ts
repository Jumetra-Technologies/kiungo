/** Common interface for emulated and real boards (RUN-02). */
export interface BoardRunner {
  readonly boardId: string;
  readonly target: "emulated" | "real";
  start(): Promise<void>;
  stop(): Promise<void>;
  /** Drive real outputs to their safe state (SAF-01). No-op for emulated boards. */
  safeState(): Promise<void>;
}
