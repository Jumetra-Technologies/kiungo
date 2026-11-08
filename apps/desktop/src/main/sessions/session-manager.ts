import { RunState } from "@kiungo/core";
import type { BoardRunner } from "./runner";

/**
 * RUN-02 / RUN-03: creates one runner per board and drives the Run state machine.
 * Runners (emulated worker or real serial session) are added in later milestones.
 */
export class SessionManager {
  state: RunState = RunState.Idle;
  private runners: BoardRunner[] = [];

  async start(): Promise<void> {
    this.state = RunState.Checking;
    // TODO(M5): circuit check -> build (Arduino CLI) -> load -> handshake -> run
    this.state = RunState.Running;
  }

  async stop(): Promise<void> {
    this.state = RunState.Stopping;
    await Promise.all(this.runners.map((r) => r.safeState()));
    await Promise.all(this.runners.map((r) => r.stop()));
    this.state = RunState.Idle;
  }

  async emergencyStop(): Promise<void> {
    await Promise.all(this.runners.map((r) => r.safeState()));
    await this.stop();
  }
}
