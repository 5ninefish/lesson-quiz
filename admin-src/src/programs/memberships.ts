import { PROGRAM } from "../config";
import type { ProgramStudentView, ProgramView } from "../types";
import { normalizeProgramId } from "./ids";

export type ProgramResolution =
  | { kind: "legacy"; programId: string }
  | { kind: "ok"; programId: string }
  | { kind: "auto"; programId: string }
  | { kind: "picker"; programIds: string[] }
  | { kind: "none" }
  | { kind: "mismatch"; requested: string; programIds: string[] };

export function activeMemberships(
  memberships: ProgramStudentView[],
  programs: ProgramView[],
  username: string,
): ProgramStudentView[] {
  const archived = new Set(programs.filter((p) => p.status === "ARCHIVED").map((p) => p.programId));
  return memberships.filter((m) => m.username === username && m.active && !archived.has(m.programId));
}

export function resolveStudentProgram(opts: {
  tablesPresent: boolean;
  memberships: ProgramStudentView[];
  programs: ProgramView[];
  username: string;
  requested: string | null | undefined;
}): ProgramResolution {
  if (!opts.tablesPresent) {
    return { kind: "legacy", programId: PROGRAM.legacyDefaultProgramId };
  }
  const active = activeMemberships(opts.memberships, opts.programs, opts.username);
  const ids = active.map((m) => m.programId);
  const requested = normalizeProgramId(opts.requested);
  if (requested) {
    if (ids.includes(requested)) return { kind: "ok", programId: requested };
    return { kind: "mismatch", requested, programIds: ids };
  }
  if (ids.length === 1) return { kind: "auto", programId: ids[0] };
  if (ids.length > 1) return { kind: "picker", programIds: ids };
  return { kind: "none" };
}

export function legacyFallbackAllowed(username: string, memberships: ProgramStudentView[], tablesPresent: boolean): boolean {
  if (!tablesPresent) return true;
  return memberships.some(
    (m) => m.username === username && m.active && m.programId === PROGRAM.legacyDefaultProgramId,
  );
}
