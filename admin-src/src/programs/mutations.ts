import { PROGRAM_HEADERS, PROGRAM_TABLES } from "../config";
import type { MutationPreview, ProgramTestView, ReleaseManual } from "../types";
import { minutesToSeconds } from "./ids";

export type SheetMutation = {
  range: string;
  values: string[][];
  preview: MutationPreview;
};

export function programTableInitMutations(): { addSheets: string[]; headers: SheetMutation[] } {
  return {
    addSheets: [...PROGRAM_TABLES],
    headers: PROGRAM_TABLES.map((tab) => ({
      range: `${tab}!A1`,
      values: [[...PROGRAM_HEADERS[tab]]],
      preview: {
        id: `init-${tab}`,
        tab,
        range: `${tab}!A1`,
        before: [],
        after: [...PROGRAM_HEADERS[tab]],
        description: `Create ${tab} header row`,
        rowNumber: 1,
      },
    })),
  };
}

export function releaseMutation(opts: {
  current: ProgramTestView;
  action: "open" | "close" | "schedule" | "attempts" | "timer" | "unset";
  openAt?: string;
  closeAt?: string;
  maxTries?: number;
  timeLimitMinutes?: number;
  actor: string;
  nowHst: string;
}): { next: ProgramTestView; preview: MutationPreview; staleIf: (live: ProgramTestView) => boolean } {
  const next: ProgramTestView = { ...opts.current, updatedAtHst: opts.nowHst, updatedBy: opts.actor };
  if (opts.action === "open") next.manual = "OPEN";
  if (opts.action === "close") next.manual = "CLOSED";
  if (opts.action === "unset") next.manual = "UNSET";
  if (opts.action === "schedule") {
    next.manual = "AUTO";
    next.openAt = opts.openAt || "";
    next.closeAt = opts.closeAt || "";
  }
  if (opts.action === "attempts" && opts.maxTries && opts.maxTries > 0) next.maxTries = opts.maxTries;
  if (opts.action === "timer" && opts.timeLimitMinutes != null) next.timeLimitSec = minutesToSeconds(opts.timeLimitMinutes);

  const after = [
    next.programId,
    next.testId,
    next.enabled ? "TRUE" : "FALSE",
    String(next.sortOrder),
    next.manual,
    next.openAt,
    next.closeAt,
    String(next.maxTries),
    String(next.timeLimitSec),
    next.updatedAtHst,
    next.updatedBy,
  ];
  const before = [
    opts.current.programId,
    opts.current.testId,
    opts.current.enabled ? "TRUE" : "FALSE",
    String(opts.current.sortOrder),
    opts.current.manual,
    opts.current.openAt,
    opts.current.closeAt,
    String(opts.current.maxTries),
    String(opts.current.timeLimitSec),
    opts.current.updatedAtHst,
    opts.current.updatedBy,
  ];
  const preview: MutationPreview = {
    id: `release-${opts.current.programId}-${opts.current.testId}-${opts.action}`,
    tab: "ProgramTests",
    range: `ProgramTests!A${opts.current.rowNumber}:K${opts.current.rowNumber}`,
    before,
    after,
    description: `${opts.action} ${opts.current.testId} in ${opts.current.programId}`,
    rowNumber: opts.current.rowNumber,
  };
  return {
    next,
    preview,
    staleIf: (live) =>
      live.manual !== opts.current.manual ||
      live.openAt !== opts.current.openAt ||
      live.closeAt !== opts.current.closeAt ||
      live.maxTries !== opts.current.maxTries ||
      live.timeLimitSec !== opts.current.timeLimitSec,
  };
}

export function verifyCells(expected: string[], observed: string[]): string[] {
  const mismatches: string[] = [];
  const n = Math.max(expected.length, observed.length);
  for (let i = 0; i < n; i++) {
    if (String(expected[i] || "") !== String(observed[i] || "")) {
      mismatches.push(`col ${i}: expected "${expected[i] || ""}", observed "${observed[i] || ""}"`);
    }
  }
  return mismatches;
}

export function asManualAction(manual: ReleaseManual): "open" | "close" | "schedule" | "unset" {
  if (manual === "OPEN") return "open";
  if (manual === "CLOSED") return "close";
  if (manual === "AUTO") return "schedule";
  return "unset";
}
