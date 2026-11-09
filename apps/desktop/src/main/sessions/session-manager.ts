import { RunState } from "@kiungo/core";
import type { BoardRunner } from "./runner";

/**
 * RUN-02 / RUN-03: owns the Run state machine and the runner for each board.
 * The build, load and handshake stages are not wired in yet, so start() currently moves
 * straight from idle to running for whatever runners are registered.
 */
export class SessionManager {
  state: RunState = RunState.Idle;
  private runners: BoardRunner[] = [];

  async start(): Promise<void> {
    if (this.state !== RunState.Idle) {
      throw new Error(`cannot start while ${this.state}`);
    }
    this.state = RunState.Checking;
    await Promise.all(this.runners.map((runner) => runner.start()));
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
