/** Electron IPC channel names shared by main, preload and renderer. */
export const IPC = {
  appVersion: "app:version",
  runStart: "run:start",
  runStop: "run:stop",
  emergencyStop: "run:emergency-stop",
} as const;

/** INJ-04: logical channels multiplexed over one USB connection. */
export enum Channel {
  Control = 0,
  SensorValues = 1, // PC to board
  ActuatorEvents = 2, // board to PC
  UserSerial = 3,
  Telemetry = 4,
}

/** INJ-04: frame = start byte, type, channel, length, payload, CRC (COBS-encoded). */
export const PROTOCOL_VERSION = 1;
export const FRAME_START = 0x7e;

export interface Frame {
  type: number;
  channel: Channel;
  payload: Uint8Array;
}

// TODO(M0): COBS encode/decode, CRC, stream parser (INJ-04).
