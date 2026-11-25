/**
 * Phase One work into desktop projects (DSK-15). A website lab session is
 * already the circuit format; its board decides the project's board, and the
 * project starts with a blank sketch. A website project (name, description,
 * objectives, hardware list) has no circuit: it becomes a blank project with
 * its details in records/about.md.
 */

import { getPinout } from "../lab/pinout";
import type { LabSession } from "../lab/types";
import { PROJECT_BOARDS } from "./format";

/** A website project as /auth/me/projects returns it. */
export interface PhaseOneProject {
  id: string;
  name: string;
  description?: string;
  objectives?: string;
  contributors?: string;
  category?: string;
  hardware?: Array<{ name?: string; quantity?: number } | string>;
  teammates?: Array<{ name?: string; role?: string } | string>;
  created_at?: string;
  updated_at?: string;
}

/** The project board for a session: its first board the desktop can build for, or the Uno. */
export function boardForSession(session: LabSession): { board: string; warning: string | null } {
  const boards = session.nodes.filter((n) => getPinout(n.partId).controller);
  const buildable = boards.find((n) => PROJECT_BOARDS.some((b) => b.part === n.partId));
  if (buildable) return { board: buildable.partId, warning: null };
  if (boards.length) {
    return { board: "arduino-uno", warning: `The desktop app can't build code for ${boards[0].label} yet, so the project's code is for the Arduino Uno. The circuit is kept as it was.` };
  }
  return { board: "arduino-uno", warning: null };
}

const line = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** records/about.md for a website project: what it is, in Markdown. */
export function phaseOneProjectNotes(project: PhaseOneProject): string {
  const parts: string[] = [`# ${line(project.name) || "Untitled project"}`, ""];
  if (line(project.description)) parts.push(line(project.description), "");
  if (line(project.objectives)) parts.push("## Objectives", "", line(project.objectives), "");
  const hardware = (project.hardware ?? []).map((h) => (typeof h === "string" ? h : `${h.quantity && h.quantity > 1 ? `${h.quantity} × ` : ""}${line(h.name)}`)).filter(Boolean);
  if (hardware.length) parts.push("## Hardware", "", ...hardware.map((h) => `- ${h}`), "");
  const team = (project.teammates ?? []).map((t) => (typeof t === "string" ? t : [line(t.name), line(t.role)].filter(Boolean).join(", "))).filter(Boolean);
  if (team.length) parts.push("## Team", "", ...team.map((t) => `- ${t}`), "");
  if (line(project.contributors)) parts.push("## Contributors", "", line(project.contributors), "");
  parts.push(`Imported from the Kiungo website${project.updated_at ? `, last changed ${project.updated_at.slice(0, 10)}` : ""}.`, "");
  return parts.join("\n");
}
