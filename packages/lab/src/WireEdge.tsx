"use client";

import { memo, useState } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";
import type { PinTone } from "@kiungo/core/lab/pinout";
import { useLabContext } from "./lab-context";
import { TONE_VAR } from "./PartNode";

export type WireEdgeData = {
  tone: PinTone;
  /** Particles run from target to source (current returning to the board, a sensor reporting). */
  reverse: boolean;
  label: string;
};

const SPEED = { power: 1.6, ground: 1.6, signal: 1.1, data: 0.55, fault: 0, idle: 0 } as const;

function WireEdgeView({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected, data }: EdgeProps & { data?: WireEdgeData }) {
  const { frame, view, analysis } = useLabContext();
  const [hover, setHover] = useState(false);
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, curvature: 0.4 });
  const live = frame.wires[id];
  const flow = live?.flow ?? "idle";
  const level = live?.level ?? 0;
  const tone = data?.tone ?? "digital";
  const fault = flow === "fault";
  const color = fault ? "var(--lab-fault)" : TONE_VAR[tone];
  const flowView = view === "flow";
  const active = level > 0.05 && !fault;
  const dim = flowView && !active && !fault;
  const width = selected ? 4 : hover ? 3.5 : flowView ? 3 : 2.6;
  const dur = SPEED[flow] || 1.2;
  const showParticles = flowView && active;
  const issue = analysis.faults.find((f) => f.wires.includes(id) && f.severity !== "tip");

  return (
    <>
      {/* Glow under live wires */}
      {flowView && (active || fault) ? <path d={path} fill="none" stroke={color} strokeWidth={10} strokeOpacity={fault ? 0.18 : 0.14} strokeLinecap="round" className={fault ? "hhip-fault-pulse" : undefined} /> : null}
      <BaseEdge
        id={id}
        path={path}
        interactionWidth={16}
        style={{
          stroke: color,
          strokeWidth: width,
          strokeOpacity: dim ? 0.35 : 1,
          strokeLinecap: "round",
          strokeDasharray: fault ? "7 6" : undefined,
          filter: selected ? `drop-shadow(0 0 4px ${color})` : undefined,
        }}
      />
      {/* Invisible wide hit area for hover labels */}
      <path d={path} fill="none" stroke="transparent" strokeWidth={18} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} />
      {showParticles
        ? [0, 1, 2].map((i) => (
            <circle key={i} r={flow === "data" ? 2.4 : 3.2} fill={color} stroke="var(--surface)" strokeWidth={1} data-testid="wire-particle">
              <animateMotion dur={`${dur}s`} begin={`${(-dur * i) / 3}s`} repeatCount="indefinite" path={path} keyPoints={data?.reverse ? "1;0" : "0;1"} keyTimes="0;1" calcMode="linear" />
            </circle>
          ))
        : null}
      {(selected || hover || (flowView && fault)) && data?.label ? (
        <EdgeLabelRenderer>
          <div
            className="pointer-events-none absolute z-10 max-w-[16rem] rounded-full border border-border bg-surface/95 px-2 py-0.5 font-mono text-[10px] text-foreground shadow-[var(--shadow-sm)] backdrop-blur"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, borderColor: fault ? "var(--lab-fault)" : undefined, color: fault ? "var(--lab-fault)" : undefined }}
          >
            {fault && issue ? issue.title : data.label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

export const WireEdge = memo(WireEdgeView);
