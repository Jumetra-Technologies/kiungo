"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@kiungo/ui/button";
import { SOURCE_AUTO, SOURCE_KEY, SOURCE_SET, controlsFor, inputOf, type Control } from "@kiungo/core/lab/controls";
import { useLab } from "./store";
import type { LabNode, NodeInputs } from "@kiungo/core/lab/types";
import { cn } from "@kiungo/ui/cn";
import { useLabContext } from "./lab-context";

/**
 * The part's inputs in the Inspector: a sensor's surroundings, an actuator's
 * command or a board's sketch settings. Values go to the session, so the
 * next frame of the simulation reads them, running or not.
 */
export function InputsPanel({ node }: { node: LabNode }) {
  const { session, analysis, frame } = useLabContext();
  const setInput = useLab((s) => s.setInput);
  const clearInputs = useLab((s) => s.clearInputs);
  const values: NodeInputs = session.inputs?.[node.id] ?? {};
  const { title, controls, note } = controlsFor(node, session.nodes, analysis);
  const touched = Object.keys(values).length > 0;
  const held = inputOf(session.inputs, node.id, SOURCE_KEY, SOURCE_AUTO) === SOURCE_SET;
  const hasSource = controls.some((c) => c.key === SOURCE_KEY);

  if (!controls.length && !note) return null;

  return (
    <section className="border-b border-border px-4 py-4 last:border-0" data-testid="inputs-panel">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{title}</h3>
        {touched ? (
          <button type="button" onClick={() => clearInputs(node.id)} className="inline-flex items-center gap-1 text-[11px] font-medium text-muted hover:text-foreground" data-testid="inputs-reset">
            <RotateCcw className="size-3" aria-hidden /> Defaults
          </button>
        ) : null}
      </div>
      {note ? <p className="text-[12px] leading-5 text-muted">{note}</p> : null}
      <div className="space-y-3">
        {controls.map((control) => (
          <Field key={control.key} control={control} value={values[control.key]} dimmed={hasSource && control.key !== SOURCE_KEY && !held} onChange={(v) => setInput(node.id, control.key, v, frame.t)} />
        ))}
        {node.partId === "stepper-motor" ? <StepperCommands nodeId={node.id} t={frame.t} /> : null}
      </div>
      {hasSource && !held ? <p className="mt-2 text-[11px] leading-4 text-muted">Showing the lab&apos;s simulated signal. Change a value to take over.</p> : null}
    </section>
  );
}

function Field({ control, value, dimmed, onChange }: { control: Control; value: number | string | boolean | undefined; dimmed: boolean; onChange: (v: number | string | boolean) => void }) {
  const id = `input-${control.key}`;
  if (control.kind === "select") {
    const current = typeof value === "string" ? value : control.default;
    return (
      <label className="flex items-center justify-between gap-3 text-[13px]" htmlFor={id}>
        <span className="text-foreground">{control.label}</span>
        <select id={id} value={current} onChange={(e) => onChange(e.target.value)} className="h-8 max-w-[11rem] rounded-[8px] border border-border bg-surface px-2 text-[12.5px]" data-testid={`input-${control.key}`}>
          {control.options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (control.kind === "toggle") {
    const current = typeof value === "boolean" ? value : control.default;
    return (
      <div className={cn("flex items-center justify-between gap-3 text-[13px]", dimmed && "opacity-70")}>
        <span className="text-foreground">{control.label}</span>
        <div role="radiogroup" aria-label={control.label} className="inline-flex rounded-[8px] border border-border p-0.5" data-testid={`input-${control.key}`}>
          {[
            [true, control.on],
            [false, control.off],
          ].map(([v, label]) => (
            <button
              key={String(v)}
              type="button"
              role="radio"
              aria-checked={current === v}
              onClick={() => onChange(v as boolean)}
              className={cn("rounded-[6px] px-2.5 py-1 text-[12px] font-medium transition-colors", current === v ? "bg-primary text-primary-foreground" : "text-muted hover:text-foreground")}
            >
              {label as string}
            </button>
          ))}
        </div>
      </div>
    );
  }
  const current = typeof value === "number" ? value : control.default;
  return (
    <div className={cn(dimmed && "opacity-70")} title={control.help}>
      <div className="flex items-center justify-between gap-3 text-[13px]">
        <label htmlFor={id} className="text-foreground">
          {control.label}
        </label>
        <span className="inline-flex items-center gap-1">
          <input
            id={id}
            type="number"
            inputMode="decimal"
            min={control.min}
            max={control.max}
            step={control.step}
            value={current}
            onChange={(e) => {
              if (e.target.value !== "") onChange(Number(e.target.value));
            }}
            className="h-7 w-20 rounded-[8px] border border-border bg-surface px-2 text-right font-mono text-[12.5px] tabular-nums"
            data-testid={`input-${control.key}`}
          />
          {control.unit ? <span className="w-7 text-[11px] text-muted">{control.unit}</span> : null}
        </span>
      </div>
      <input type="range" aria-label={`${control.label} slider`} min={control.min} max={control.max} step={control.step} value={current} onChange={(e) => onChange(Number(e.target.value))} className="mt-1.5 w-full accent-[var(--primary)]" />
      {control.help ? <p className="mt-0.5 text-[11px] leading-4 text-muted">{control.help}</p> : null}
    </div>
  );
}

/** Move the stepper by a number of steps from where it is now. */
function StepperCommands({ nodeId, t }: { nodeId: string; t: number }) {
  const commandStepper = useLab((s) => s.commandStepper);
  const zeroStepper = useLab((s) => s.zeroStepper);
  const [steps, setSteps] = useState(512);
  return (
    <div className="rounded-[10px] border border-border bg-canvas p-2.5" data-testid="stepper-commands">
      <div className="flex items-center gap-2 text-[13px]">
        <label htmlFor="input-steps" className="text-foreground">
          Move
        </label>
        <input id="input-steps" type="number" inputMode="numeric" step={1} value={steps} onChange={(e) => setSteps(Math.round(Number(e.target.value) || 0))} className="h-7 w-20 rounded-[8px] border border-border bg-surface px-2 text-right font-mono text-[12.5px] tabular-nums" data-testid="input-steps" />
        <span className="text-[11px] text-muted">steps</span>
        <Button size="sm" className="ml-auto h-7 text-[11px]" onClick={() => commandStepper(nodeId, steps, t)} data-testid="stepper-go">
          Go
        </Button>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-muted">Positive is clockwise. 2048 steps is one turn of the shaft.</p>
      <div className="mt-2 flex gap-1.5">
        <Button size="sm" variant="secondary" className="h-7 text-[11px]" onClick={() => commandStepper(nodeId, 0, t)} data-testid="stepper-stop">
          Stop
        </Button>
        <Button size="sm" variant="secondary" className="h-7 text-[11px]" onClick={() => zeroStepper(nodeId, t)} data-testid="stepper-zero">
          Zero position
        </Button>
      </div>
    </div>
  );
}
