export type Control =
  | {
      key: string;
      kind: "number";
      label: string;
      min: number;
      max: number;
      step: number;
      unit?: string;
      default: number;
      help?: string;
    }
  | {
      key: string;
      kind: "toggle";
      label: string;
      on: string;
      off: string;
      default: boolean;
      help?: string;
    }
  | {
      key: string;
      kind: "select";
      label: string;
      options: Array<{ id: string; label: string }>;
      default: string;
      help?: string;
    };

/** The "where does the value come from" switch every sensor and free actuator has. */
export const SOURCE_KEY = "source";

export const SOURCE_AUTO = "auto";

export const SOURCE_SET = "set";

export const source = (autoLabel: string, setLabel = "Set by you"): Control => ({
  key: SOURCE_KEY,
  kind: "select",
  label: "Input",
  options: [
    { id: SOURCE_AUTO, label: autoLabel },
    { id: SOURCE_SET, label: setLabel },
  ],
  default: SOURCE_AUTO,
});

export const num = ({
  key,
  label,
  min,
  max,
  step,
  def,
  unit,
  help,
}: {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  def: number;
  unit?: string;
  help?: string;
}): Control => ({ key, kind: "number", label, min, max, step, default: def, unit, help });
