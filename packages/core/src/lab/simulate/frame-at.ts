/**
 * The lab's simulation: a pure function of the build, the inputs and the time.
 *
 * Each board runs the default sketch in `sketch.ts`: it reads the sensors
 * wired to it, compares them to its settings and drives its outputs. Sensors
 * read what the person set in the Inspector, or the lab's simulated sweep
 * until they do. Actuators with no sensor driving them follow their own
 * command. Parts only respond when the analysis says they are powered and
 * connected, so a missing ground shows up as a dark LED, as it would on a
 * bench. Being pure, any moment can be sampled again, which is how the
 * Signals panel draws its traces and how the tests check a frame.
 */

import type { Analysis } from "../circuit";
import { isSet } from "../controls";
import { getPinout } from "../pinout";
import { planBoard, type BoardPlan, type Inputs } from "../sketch";
import type { LabNode, LabWire } from "../types";
import { buzzerLive, ledLive, relayLive, rgbLive } from "./lights";
import { boardFor, outputOrder, runnable, type Frame, type NodeLive, type PartCtx } from "./live";
import { dcMotorLive, servoLive, stepperLive } from "./motors";
import { breadboardLive, controllerLive, otherLive, resistorLive } from "./panels";
import { readSensors } from "./sensors";
import { wireFlows } from "./wires";

const OUTPUTS: Record<string, (c: PartCtx) => NodeLive> = {
  led: ledLive,
  buzzer: buzzerLive,
  relay: relayLive,
  "rgb-led": rgbLive,
  servo: servoLive,
  "dc-motor": dcMotorLive,
  "stepper-motor": stepperLive,
};

export function frameAt({
  nodes,
  wires,
  analysis,
  t,
  running,
  inputs = undefined,
}: {
  nodes: LabNode[];
  wires: LabWire[];
  analysis: Analysis;
  t: number;
  running: boolean;
  inputs?: Inputs;
}): Frame {
  const live: Record<string, NodeLive> = {};
  const pins: Record<string, number> = {};
  const order = outputOrder(nodes, analysis);
  const { samplesByBoard, silentByBoard } = readSensors(
    nodes,
    analysis,
    { t, running, inputs },
    { live, pins },
  );

  const plans = new Map<string, BoardPlan>();
  const planFor = (boardId: string | null): BoardPlan => {
    const key = boardId ?? "";
    let plan = plans.get(key);
    if (!plan) {
      plan = planBoard(boardId, boardId ? (samplesByBoard.get(boardId) ?? []) : [], inputs);
      plans.set(key, plan);
    }
    return plan;
  };

  for (const node of nodes) {
    if (live[node.id]) continue;
    const report = analysis.nodes[node.id];
    const pinout = getPinout(node.partId);
    if (node.partId === "resistor") {
      live[node.id] = resistorLive(node, inputs);
      continue;
    }
    if (pinout.passive) {
      live[node.id] = breadboardLive(node, analysis, nodes);
      continue;
    }
    if (pinout.controller) {
      live[node.id] = controllerLive(
        { node, report, plan: planFor(node.id), t, running },
        pinout,
        pins,
      );
      continue;
    }
    const ready = runnable(report);
    const board = boardFor(report);
    const plan = planFor(board);
    const ctx: PartCtx = {
      node,
      nodes,
      report,
      t,
      running,
      ready,
      go: running && ready,
      k: order.get(node.id) ?? 0,
      board,
      plan,
      period: (2 * plan.settings.delayMs) / 1000,
      held: isSet(inputs, node.id),
      inputs,
      silentByBoard,
      setLinks: (fn) => {
        for (const link of report?.links ?? []) {
          const v = fn(link.role, link.pin);
          pins[`${node.id}:${link.pin}`] = v;
          pins[`${link.board}:${link.boardPin}`] = v;
        }
      },
    };
    live[node.id] = (Object.hasOwn(OUTPUTS, node.partId) ? OUTPUTS[node.partId]! : otherLive)(ctx);
  }

  const wireLive = wireFlows(nodes, wires, analysis, pins, running);
  return { t, running, nodes: live, pins, wires: wireLive };
}
