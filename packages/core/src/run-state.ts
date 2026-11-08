/** RUN-03: states of the single Run action. */
export enum RunState {
  Idle = "idle",
  Checking = "checking",
  Building = "building",
  Loading = "loading",
  Handshaking = "handshaking",
  Running = "running",
  Stopping = "stopping",
}
