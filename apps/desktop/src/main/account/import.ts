/**
 * Phase One work into desktop projects (DSK-15): a session file saved from
 * the website's lab, or the lab sessions and projects on the person's
 * account. Each becomes a new project; importing the same thing again makes a
 * second copy and says so.
 */

import type { ImportCandidate, ImportList, OpenResult } from "@kiungo/api";
import { parseSessionFile, SessionFileError } from "@kiungo/core/lab/session-file";
import { getPinout } from "@kiungo/core/lab/pinout";
import { boardForSession, phaseOneProjectNotes, type ImportKind, type PhaseOneProject } from "@kiungo/core/project";
import type { ProjectService } from "../projects/service";
import { AccountProblem, type AccountClient } from "./client";

const MAX_FILE = 5 * 1024 * 1024;

function withNotes(result: OpenResult, notes: string[]): OpenResult {
  if (!result.ok || !notes.length) return result;
  return { ok: true, project: { ...result.project, notes } };
}

async function copyNote(projects: ProjectService, source: { kind: ImportKind; id: string }): Promise<string[]> {
  const copies = await projects.importedCopies(source);
  return copies.length ? [`You imported this before (${copies.join(", ")}). This is a second copy; the first is unchanged.`] : [];
}

/** A lab session file's text, as a project. */
export async function importSessionText(projects: ProjectService, text: string): Promise<OpenResult> {
  if (text.length > MAX_FILE) return { ok: false, message: "That file is too big to be a lab session." };
  let parsed: ReturnType<typeof parseSessionFile>;
  try {
    parsed = parseSessionFile(text, { keepId: true });
  } catch (error) {
    return { ok: false, message: error instanceof SessionFileError ? error.message : "That file couldn't be read." };
  }
  const source = { kind: "session-file" as const, id: parsed.session.id };
  const { board, warning } = boardForSession(parsed.session);
  const notes = [...(await copyNote(projects, source)), ...(warning ? [warning] : [])];
  const result = await projects.importFrom({ name: parsed.session.name, board, session: parsed.session, source });
  return withNotes(result.ok ? { ok: true, project: { ...result.project, warnings: parsed.warnings } } : result, notes);
}

type RawSession = { id?: unknown; name?: unknown; nodes?: unknown; updatedAt?: unknown };

const sessionDetail = (s: RawSession) => {
  const nodes = Array.isArray(s.nodes) ? (s.nodes as Array<{ partId?: unknown; label?: unknown }>) : [];
  const board = nodes.find((n) => typeof n.partId === "string" && getPinout(n.partId).controller);
  return `${nodes.length} part${nodes.length === 1 ? "" : "s"}${board && typeof board.label === "string" ? `, ${board.label}` : ""}`;
};

/** What's on the account to import. */
export async function listAccount(projects: ProjectService, account: AccountClient): Promise<ImportList> {
  try {
    const [sessions, phaseOne] = await Promise.all([account.get<RawSession[]>("/auth/me/lab-sessions"), account.get<PhaseOneProject[]>("/auth/me/projects")]);
    const items: ImportCandidate[] = [];
    for (const s of Array.isArray(sessions) ? sessions : []) {
      if (typeof s?.id !== "string") continue;
      items.push({ kind: "lab-session", id: s.id, name: typeof s.name === "string" && s.name ? s.name : "Untitled session", detail: sessionDetail(s), updatedAt: typeof s.updatedAt === "string" ? s.updatedAt : null, copies: await projects.importedCopies({ kind: "lab-session", id: s.id }) });
    }
    for (const p of Array.isArray(phaseOne) ? phaseOne : []) {
      if (typeof p?.id !== "string") continue;
      items.push({ kind: "phase-one-project", id: p.id, name: p.name || "Untitled project", detail: p.category && p.category !== "other" ? `${p.category[0].toUpperCase()}${p.category.slice(1)} project` : "Project", updatedAt: p.updated_at ?? null, copies: await projects.importedCopies({ kind: "phase-one-project", id: p.id }) });
    }
    return { ok: true, items };
  } catch (error) {
    return { ok: false, message: error instanceof AccountProblem ? error.message : "Your account couldn't be read." };
  }
}

/** One item from the account, fetched again here: the interface only names it. */
export async function importFromAccount(projects: ProjectService, account: AccountClient, kind: ImportCandidate["kind"], id: string): Promise<OpenResult> {
  try {
    if (kind === "lab-session") {
      const sessions = await account.get<unknown[]>("/auth/me/lab-sessions");
      const raw = (Array.isArray(sessions) ? sessions : []).find((s) => (s as RawSession)?.id === id);
      if (!raw) return { ok: false, message: "That lab session isn't on your account any more." };
      const parsed = parseSessionFile(raw, { keepId: true });
      const source = { kind, id };
      const { board, warning } = boardForSession(parsed.session);
      const notes = [...(await copyNote(projects, source)), ...(warning ? [warning] : [])];
      const result = await projects.importFrom({ name: parsed.session.name, board, session: parsed.session, source });
      return withNotes(result.ok ? { ok: true, project: { ...result.project, warnings: parsed.warnings } } : result, notes);
    }
    const project = await account.get<PhaseOneProject>(`/auth/me/projects/${encodeURIComponent(id)}`);
    const source = { kind, id };
    const notes = [...(await copyNote(projects, source)), "Website projects have no circuit: its details are in records/about.md. Build the circuit in the lab."];
    const result = await projects.importFrom({ name: project.name, board: "arduino-uno", records: [{ name: "about.md", content: phaseOneProjectNotes(project) }], source });
    return withNotes(result, notes);
  } catch (error) {
    if (error instanceof SessionFileError) return { ok: false, message: error.message };
    return { ok: false, message: error instanceof AccountProblem ? error.message : "That couldn't be imported." };
  }
}
