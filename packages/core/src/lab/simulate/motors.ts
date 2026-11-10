import { inputOf } from "../controls";
import {
  DC_MOTOR_MAX_RPM,
  STEPPER_STEPS_PER_TURN,
  fmt,
  square,
  stepperStepsAt,
  type NodeLive,
  type PartCtx,
  type Reading,
} from "./live";

/** The angle the servo is told to hold: the gate policy with a PIR on the board, else its own command. */
function servoCommand(c: PartCtx): { gate: boolean; commanded: number | null } {
  const { plan, held, inputs, node } = c;
  const gate = plan.motion !== null;
  if (gate)
    return { gate, commanded: plan.motion ? plan.settings.gateOpen : plan.settings.gateRest };
  return { gate, commanded: held ? inputOf(inputs, node.id, "angle", 90) : null };
}

function servoAngle(c: PartCtx, commanded: number | null): number {
  if (!c.go) return commanded ?? 90;
  if (commanded !== null) return Math.min(180, Math.max(0, commanded));
  return 90 + 75 * Math.sin(c.t * 1.2 + c.k);
}

function servoCommandText(c: PartCtx, gate: boolean, angle: number): string {
  const { plan, held } = c;
  if (gate)
    return plan.motion
      ? `Open (${plan.settings.gateOpen}°): motion seen`
      : `Rest (${plan.settings.gateRest}°): no motion`;
  return held ? `Hold ${Math.round(angle)}°` : "Sweep (simulated)";
}

export function servoLive(c: PartCtx): NodeLive {
  // Gate policy when a PIR shares the board; otherwise the servo's own command.
  const { go } = c;
  const { gate, commanded } = servoCommand(c);
  const angle = servoAngle(c, commanded);
  c.setLinks((role) => (role === "pwm" ? (go ? 0.05 + (angle / 180) * 0.05 + 0.4 : 0) : 0));
  return {
    on: go,
    level: angle / 180,
    angle,
    readings: [
      { label: "Angle", value: `${Math.round(angle)}°` },
      ...(go ? [{ label: "Command", value: servoCommandText(c, gate, angle) }] : []),
    ],
    badge: `${Math.round(angle)}°`,
  };
}

interface MotorDrive {
  duty: number;
  forward: boolean;
  note?: string;
}

/** A DC motor the person set: their speed and direction, if the driver's pins allow it. */
function heldMotor(c: PartCtx, hasEn: boolean, in1: boolean, in2: boolean): MotorDrive {
  const { inputs, node, go } = c;
  const speed = inputOf(inputs, node.id, "speed", 0) / 100;
  const forward = inputOf(inputs, node.id, "direction", "forward") !== "reverse";
  const dirPin = forward ? in1 : in2;
  if (!go) return { duty: 0, forward };
  if (!dirPin)
    return {
      duty: 0,
      forward,
      note: `${forward ? "IN1" : "IN2"} isn't wired, so the driver can't turn ${forward ? "forward" : "in reverse"}`,
    };
  if (!hasEn)
    return { duty: speed > 0 ? 1 : 0, forward, note: "EN isn't wired: full speed or stopped" };
  return { duty: speed, forward };
}

function motorDrive(c: PartCtx): MotorDrive {
  const { report, held, go, t } = c;
  const hasEn = report?.links.some((l) => l.pin === "EN") ?? false;
  const in1 = report?.links.some((l) => l.pin === "IN1") ?? false;
  const in2 = report?.links.some((l) => l.pin === "IN2") ?? false;
  if (held) return heldMotor(c, hasEn, in1, in2);
  return {
    duty: go ? (hasEn ? 0.35 + 0.65 * Math.abs(Math.sin(t / 2.5)) : 1) : 0,
    forward: square(t, 8) === 1,
  };
}

function motorPin(pin: string, duty: number, on: boolean, forward: boolean): number {
  if (pin === "EN") return duty;
  if (pin === "IN1") return on && forward ? 1 : 0;
  if (pin === "IN2") return on && !forward ? 1 : 0;
  return 0;
}

export function dcMotorLive(c: PartCtx): NodeLive {
  const { go, held, inputs, node, t } = c;
  const { duty, forward, note } = motorDrive(c);
  c.setLinks((_, pin) => motorPin(pin, duty, go, forward));
  const rpm = Math.round(duty * DC_MOTOR_MAX_RPM);
  const command = held
    ? `${Math.round(inputOf(inputs, node.id, "speed", 0))} % ${forward ? "forward" : "reverse"}`
    : "Varying (simulated)";
  return {
    on: duty > 0,
    level: duty,
    angle: ((((forward ? 1 : -1) * t * rpm * 6) % 360) + 360) % 360,
    readings: [
      { label: "Speed", value: `${rpm} rpm` },
      { label: "Direction", value: rpm ? (forward ? "Forward" : "Reverse") : "Stopped" },
      ...(go ? [{ label: "Command", value: command }] : []),
      ...(note ? [{ label: "Note", value: note }] : []),
    ],
    badge: go ? (rpm ? `${rpm} rpm` : "Stopped") : "Stopped",
  };
}

/** The stepper's command and last move, as the Inspector shows them. */
function stepperReadings(c: PartCtx, steps: number, target: number | null): Reading[] {
  const { go, held, inputs, node } = c;
  const remaining = target === null ? null : target - steps;
  // The last move commanded (Go), and how much of it the shaft has done: kept apart from the position.
  const from = held
    ? inputOf(inputs, node.id, "cmdStart", inputOf(inputs, node.id, "cmdFrom", 0))
    : 0;
  const goal = held ? inputOf(inputs, node.id, "cmdGoal", target ?? from) : from;
  const commanded = goal - from;
  const executed = Math.abs(steps - from);
  const stopped = target !== null && target !== goal;
  const toGo = remaining
    ? `${Math.abs(remaining)} steps to go ${remaining > 0 ? "clockwise" : "anticlockwise"}`
    : "Holding";
  return [
    ...(go ? [{ label: "Command", value: held ? toGo : "Turning (simulated)" }] : []),
    ...(held && commanded
      ? [
          {
            label: "Last move",
            value: `${commanded > 0 ? "+" : "−"}${Math.abs(commanded)} steps`,
          },
          {
            label: "Done",
            value: `${executed} of ${Math.abs(commanded)}${stopped && steps === target ? ", stopped" : ""}`,
          },
        ]
      : []),
  ];
}

export function stepperLive(c: PartCtx): NodeLive {
  // Commanded: move from → target at the set speed, then hold. Simulated: turn at 128 steps/s.
  const { held, go, inputs, node, t } = c;
  const steps = held ? stepperStepsAt(inputs, node.id, t) : go ? Math.floor(t * 128) : 0;
  const target = held
    ? inputOf(inputs, node.id, "cmdTarget", inputOf(inputs, node.id, "cmdFrom", 0))
    : null;
  const moving = go && (held ? steps !== target : true);
  const angle =
    ((((steps % STEPPER_STEPS_PER_TURN) + STEPPER_STEPS_PER_TURN) % STEPPER_STEPS_PER_TURN) /
      STEPPER_STEPS_PER_TURN) *
    360;
  c.setLinks((_, pin) => (moving && pin === `IN${(((steps % 4) + 4) % 4) + 1}` ? 1 : 0));
  return {
    on: moving,
    level: moving ? 1 : 0,
    angle,
    readings: [
      { label: "Position", value: `${fmt(angle, 0)}°` },
      { label: "Position (steps)", value: `${steps}` },
      ...stepperReadings(c, steps, target),
    ],
    badge: `${fmt(angle, 0)}°`,
  };
}
