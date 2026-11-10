import { num, source, type Control } from "./control";
import { DEFAULT_OHMS, RESISTOR_VALUES, formatOhms } from "../../parts/models/passives";

/** Sensor surroundings. The ranges are the parts' documented measuring ranges. */
export const SENSOR_CONTROLS: Record<string, Control[]> = {
  "hc-sr04": [
    source("Simulated sweep (30–50 cm)", "Obstacle set by you"),
    num({
      key: "distanceCm",
      label: "Obstacle distance",
      min: 2,
      max: 400,
      step: 1,
      def: 30,
      unit: "cm",
      help: "HC-SR04 range: 2–400 cm",
    }),
  ],
  pir: [
    source("Simulated (motion every 8 s)", "Set by you"),
    { key: "motion", kind: "toggle", label: "Motion", on: "Detected", off: "None", default: false },
  ],
  dht11: [
    source("Simulated sweep"),
    num({
      key: "temperatureC",
      label: "Temperature",
      min: 0,
      max: 50,
      step: 0.1,
      def: 24,
      unit: "°C",
      help: "DHT11 range: 0–50 °C",
    }),
    num({
      key: "humidity",
      label: "Humidity",
      min: 20,
      max: 90,
      step: 1,
      def: 55,
      unit: "%",
      help: "DHT11 range: 20–90 %",
    }),
  ],
  dht22: [
    source("Simulated sweep"),
    num({
      key: "temperatureC",
      label: "Temperature",
      min: -40,
      max: 80,
      step: 0.1,
      def: 24,
      unit: "°C",
    }),
    num({ key: "humidity", label: "Humidity", min: 0, max: 100, step: 1, def: 55, unit: "%" }),
  ],
  am2302: [
    source("Simulated sweep"),
    num({
      key: "temperatureC",
      label: "Temperature",
      min: -40,
      max: 80,
      step: 0.1,
      def: 24,
      unit: "°C",
    }),
    num({ key: "humidity", label: "Humidity", min: 0, max: 100, step: 1, def: 55, unit: "%" }),
  ],
  ds18b20: [
    source("Simulated sweep"),
    num({
      key: "temperatureC",
      label: "Temperature",
      min: -55,
      max: 125,
      step: 0.1,
      def: 24.5,
      unit: "°C",
    }),
  ],
  ldr: [
    source("Simulated sweep"),
    num({ key: "light", label: "Light", min: 0, max: 100, step: 1, def: 60, unit: "%" }),
  ],
  "soil-moisture": [
    source("Simulated (drying out)"),
    num({ key: "moisture", label: "Soil moisture", min: 0, max: 100, step: 1, def: 45, unit: "%" }),
  ],
  mq2: [
    source("Simulated sweep"),
    num({ key: "gasPpm", label: "Gas", min: 0, max: 10000, step: 10, def: 300, unit: "ppm" }),
  ],
  mpu6050: [
    source("Simulated (rocking)"),
    num({ key: "pitch", label: "Pitch", min: -90, max: 90, step: 1, def: 0, unit: "°" }),
    num({ key: "roll", label: "Roll", min: -90, max: 90, step: 1, def: 0, unit: "°" }),
  ],
  bmp280: [
    source("Simulated sweep"),
    num({
      key: "pressureHpa",
      label: "Pressure",
      min: 300,
      max: 1100,
      step: 0.1,
      def: 1013.2,
      unit: "hPa",
    }),
    num({
      key: "temperatureC",
      label: "Temperature",
      min: -40,
      max: 85,
      step: 0.1,
      def: 23.1,
      unit: "°C",
    }),
  ],
};

/** Commands for actuators that no sensor on the board is driving. */
export const ACTUATOR_CONTROLS: Record<string, Control[]> = {
  servo: [
    source("Simulated sweep (15–165°)", "Angle set by you"),
    num({
      key: "angle",
      label: "Angle",
      min: 0,
      max: 180,
      step: 1,
      def: 90,
      unit: "°",
      help: "SG90 travel: 0–180°",
    }),
  ],
  "dc-motor": [
    source("Simulated (speed and direction vary)", "Command set by you"),
    num({
      key: "speed",
      label: "Speed (PWM)",
      min: 0,
      max: 100,
      step: 1,
      def: 0,
      unit: "%",
      help: "Duty on EN. 100 % ≈ 140 rpm with no load; 0 stops the motor.",
    }),
    {
      key: "direction",
      kind: "select",
      label: "Direction",
      options: [
        { id: "forward", label: "Forward (IN1 high)" },
        { id: "reverse", label: "Reverse (IN2 high)" },
      ],
      default: "forward",
    },
  ],
  "stepper-motor": [
    source("Simulated (turns continuously)", "Steps commanded by you"),
    num({
      key: "stepsPerSecond",
      label: "Speed",
      min: 1,
      max: 1000,
      step: 1,
      def: 256,
      unit: "steps/s",
      help: "28BYJ-48 with ULN2003: 2048 steps per turn of the output shaft.",
    }),
  ],
};

/** Values of passive parts. */
export const PASSIVE_CONTROLS: Record<string, Control[]> = {
  resistor: [
    {
      key: "ohms",
      kind: "select",
      label: "Value",
      options: RESISTOR_VALUES.map((v) => ({
        id: String(v),
        label: `${formatOhms(v)}${v === 220 ? " (red red brown)" : v === 1000 ? " (brown black red)" : v === 10000 ? " (brown black orange)" : ""}`,
      })),
      default: String(DEFAULT_OHMS),
      help: "The bands on the part change with it. 220 Ω suits an LED on a 5 V pin.",
    },
  ],
};

/** Sketch settings on a board. `when` says which wired parts make a setting relevant. */
export const BOARD_CONTROLS: Array<Control & { when: (partsOnBoard: Set<string>) => boolean }> = [
  {
    ...num({
      key: "delayMs",
      label: "Blink delay",
      min: 50,
      max: 5000,
      step: 50,
      def: 500,
      unit: "ms",
      help: "delay() between switching an output on and off, as in the Arduino Blink sketch. Period = 2 × delay.",
    }),
    when: () => true,
  },
  {
    ...num({
      key: "warnCm",
      label: "Warning distance",
      min: 2,
      max: 400,
      step: 1,
      def: 20,
      unit: "cm",
      help: "Outputs on this board turn on while the ultrasonic distance is below this.",
    }),
    when: (p) => p.has("hc-sr04"),
  },
  {
    ...num({
      key: "gateOpen",
      label: "Gate open angle",
      min: 0,
      max: 180,
      step: 1,
      def: 90,
      unit: "°",
      help: "Servo angle while motion is seen.",
    }),
    when: (p) => p.has("pir") && p.has("servo"),
  },
  {
    ...num({
      key: "gateRest",
      label: "Gate resting angle",
      min: 0,
      max: 180,
      step: 1,
      def: 0,
      unit: "°",
      help: "Servo angle while no motion is seen.",
    }),
    when: (p) => p.has("pir") && p.has("servo"),
  },
  {
    ...num({
      key: "gasPpm",
      label: "Gas alarm level",
      min: 0,
      max: 10000,
      step: 10,
      def: 450,
      unit: "ppm",
      help: "Outputs turn on above this.",
    }),
    when: (p) => p.has("mq2"),
  },
  {
    ...num({
      key: "dryPct",
      label: "Dry below",
      min: 0,
      max: 100,
      step: 1,
      def: 30,
      unit: "%",
      help: "Outputs (a pump relay, say) turn on below this moisture.",
    }),
    when: (p) => p.has("soil-moisture"),
  },
  {
    ...num({
      key: "darkPct",
      label: "Dark below",
      min: 0,
      max: 100,
      step: 1,
      def: 30,
      unit: "%",
      help: "Outputs (a night light) turn on below this light level.",
    }),
    when: (p) => p.has("ldr"),
  },
];

export function stripWhen(control: Control & { when: unknown }): Control {
  const copy: Control & { when?: unknown } = { ...control };
  delete copy.when;
  return copy;
}
