import { PROGRAM } from "../config";
import { TEST_TITLES, canonicalTestId, normalizeUsername, type TestId } from "../ids";
import type { HealthIssue, ProgramStatus, ProgramStudentView, ProgramTestView, ProgramView, ReleaseManual } from "../types";
import { asBool, asInt, cell, headerIndex, looksLikeHeaderRow, rowHasContent, type SheetValues } from "../workbook/cells";
import { evaluateRelease } from "../workbook/releases";
import { isValidProgramId, normalizeProgramId } from "./ids";

function asStatus(raw: string): ProgramStatus | null {
  const v = raw.trim().toUpperCase();
  if (v === "DRAFT" || v === "ACTIVE" || v === "ARCHIVED") return v;
  return null;
}

function asManual(raw: string): ReleaseManual {
  const v = raw.toUpperCase();
  if (v === "OPEN" || v === "CLOSED" || v === "AUTO") return v;
  return "UNSET";
}

export type ProgramsParse = { programs: ProgramView[]; issues: HealthIssue[] };

export function parsePrograms(values: SheetValues): ProgramsParse {
  const issues: HealthIssue[] = [];
  const programs: ProgramView[] = [];
  if (!values.length) return { programs, issues };

  const headered = looksLikeHeaderRow(values[0], ["ProgramId", "ProgramName", "Status", "CreatedAtHST"]);
  const start = headered ? 1 : 0;
  const headers = headered ? values[0].map((c) => String(c ?? "").trim()) : [];
  const col = (name: string, fallback: number) =>
    headered && headerIndex(headers, name) >= 0 ? headerIndex(headers, name) : fallback;
  const seen = new Map<string, number>();

  for (let i = start; i < values.length; i++) {
    const row = values[i];
    const rowNumber = i + 1;
    if (!rowHasContent(row)) continue;
    const programId = normalizeProgramId(cell(row, col("ProgramId", 0)));
    if (!isValidProgramId(programId)) {
      issues.push({
        id: `programs-id-${rowNumber}`,
        severity: "error",
        tab: "Programs",
        rowNumber,
        message: `Invalid ProgramId "${cell(row, col("ProgramId", 0))}".`,
      });
      continue;
    }
    const prev = seen.get(programId);
    if (prev) {
      issues.push({
        id: `programs-dup-${programId}`,
        severity: "error",
        tab: "Programs",
        rowNumber,
        message: `Duplicate ProgramId "${programId}" (also row ${prev}). Archived ids cannot be reused.`,
      });
    } else {
      seen.set(programId, rowNumber);
    }
    const status = asStatus(cell(row, col("Status", 2)));
    if (!status) {
      issues.push({
        id: `programs-status-${rowNumber}`,
        severity: "error",
        tab: "Programs",
        rowNumber,
        message: `Invalid Status "${cell(row, col("Status", 2))}".`,
      });
    }
    const programName = cell(row, col("ProgramName", 1));
    if (!programName) {
      issues.push({
        id: `programs-name-${rowNumber}`,
        severity: "error",
        tab: "Programs",
        rowNumber,
        message: "ProgramName is blank.",
      });
    }
    const startAt = cell(row, col("StartAt", 3));
    const endAt = cell(row, col("EndAt", 4));
    if (startAt && endAt && Date.parse(endAt) < Date.parse(startAt)) {
      issues.push({
        id: `programs-window-${rowNumber}`,
        severity: "error",
        tab: "Programs",
        rowNumber,
        message: "EndAt is before StartAt.",
      });
    }
    programs.push({
      programId,
      programName: programName || programId,
      status: status || "DRAFT",
      startAt,
      endAt,
      createdAtHst: cell(row, col("CreatedAtHST", 5)),
      createdBy: cell(row, col("CreatedBy", 6)),
      updatedAtHst: cell(row, col("UpdatedAtHST", 7)),
      updatedBy: cell(row, col("UpdatedBy", 8)),
      rowNumber,
    });
  }
  return { programs, issues };
}

export type ProgramStudentsParse = { memberships: ProgramStudentView[]; issues: HealthIssue[] };

export function parseProgramStudents(values: SheetValues): ProgramStudentsParse {
  const issues: HealthIssue[] = [];
  const memberships: ProgramStudentView[] = [];
  if (!values.length) return { memberships, issues };
  const headered = looksLikeHeaderRow(values[0], ["ProgramId", "Username", "Active", "AssignedAtHST"]);
  const start = headered ? 1 : 0;
  const headers = headered ? values[0].map((c) => String(c ?? "").trim()) : [];
  const col = (name: string, fallback: number) =>
    headered && headerIndex(headers, name) >= 0 ? headerIndex(headers, name) : fallback;
  const seen = new Map<string, number>();

  for (let i = start; i < values.length; i++) {
    const row = values[i];
    const rowNumber = i + 1;
    if (!rowHasContent(row)) continue;
    const programId = normalizeProgramId(cell(row, col("ProgramId", 0)));
    const username = normalizeUsername(cell(row, col("Username", 1)));
    if (!isValidProgramId(programId) || !username) {
      issues.push({
        id: `pstudents-bad-${rowNumber}`,
        severity: "error",
        tab: "ProgramStudents",
        rowNumber,
        message: "Membership row missing ProgramId or Username.",
      });
      continue;
    }
    const key = `${programId}::${username}`;
    const prev = seen.get(key);
    if (prev) {
      issues.push({
        id: `pstudents-dup-${key}`,
        severity: "error",
        tab: "ProgramStudents",
        rowNumber,
        message: `Duplicate membership ${username} / ${programId} (also row ${prev}).`,
      });
    } else {
      seen.set(key, rowNumber);
    }
    memberships.push({
      programId,
      username,
      active: asBool(cell(row, col("Active", 2)) || "true"),
      assignedAtHst: cell(row, col("AssignedAtHST", 3)),
      assignedBy: cell(row, col("AssignedBy", 4)),
      rowNumber,
    });
  }
  return { memberships, issues };
}

export type ProgramTestsParse = { tests: ProgramTestView[]; issues: HealthIssue[] };

export function parseProgramTests(values: SheetValues, now = new Date()): ProgramTestsParse {
  const issues: HealthIssue[] = [];
  const tests: ProgramTestView[] = [];
  if (!values.length) return { tests, issues };
  const headered = looksLikeHeaderRow(values[0], ["ProgramId", "TestId", "Manual", "MaxTries"]);
  const start = headered ? 1 : 0;
  const headers = headered ? values[0].map((c) => String(c ?? "").trim()) : [];
  const col = (name: string, fallback: number) =>
    headered && headerIndex(headers, name) >= 0 ? headerIndex(headers, name) : fallback;
  const seen = new Map<string, number>();

  for (let i = start; i < values.length; i++) {
    const row = values[i];
    const rowNumber = i + 1;
    if (!rowHasContent(row)) continue;
    const programId = normalizeProgramId(cell(row, col("ProgramId", 0)));
    const rawId = cell(row, col("TestId", 1));
    const testId = canonicalTestId(rawId);
    if (!isValidProgramId(programId) || !testId) {
      issues.push({
        id: `ptests-bad-${rowNumber}`,
        severity: "error",
        tab: "ProgramTests",
        rowNumber,
        message: `Unknown program/test "${programId}" / "${rawId}".`,
      });
      continue;
    }
    const key = `${programId}::${testId}`;
    const prev = seen.get(key);
    if (prev) {
      issues.push({
        id: `ptests-dup-${key}`,
        severity: "error",
        tab: "ProgramTests",
        rowNumber,
        message: `Duplicate program test ${testId} in ${programId} (also row ${prev}).`,
      });
    } else {
      seen.set(key, rowNumber);
    }
    const manual = asManual(cell(row, col("Manual", 4)));
    const openAt = cell(row, col("OpenAt", 5));
    const closeAt = cell(row, col("CloseAt", 6));
    const maxTries = asInt(cell(row, col("MaxTries", 7)));
    const timeLimitSec = asInt(cell(row, col("TimeLimitSec", 8)));
    const ev = evaluateRelease({ manual, openAt, closeAt }, now);
    tests.push({
      programId,
      testId,
      enabled: cell(row, col("Enabled", 2)) === "" ? true : asBool(cell(row, col("Enabled", 2))),
      sortOrder: asInt(cell(row, col("SortOrder", 3))) || 1,
      manual,
      openAt,
      closeAt,
      maxTries: maxTries && maxTries > 0 ? maxTries : 2,
      timeLimitSec: timeLimitSec != null && timeLimitSec >= 0 ? timeLimitSec : 0,
      updatedAtHst: cell(row, col("UpdatedAtHST", 9)),
      updatedBy: cell(row, col("UpdatedBy", 10)),
      rowNumber,
      title: TEST_TITLES[testId],
      ...ev,
    });
  }
  return { tests, issues };
}

export type ProgramStateParse = {
  state: import("../types").ProgramStateView[];
  issues: HealthIssue[];
};

export function parseProgramStudentState(values: SheetValues): ProgramStateParse {
  const issues: HealthIssue[] = [];
  const state: import("../types").ProgramStateView[] = [];
  if (!values.length) return { state, issues };
  const headered = looksLikeHeaderRow(values[0], ["ProgramId", "Username", "TestId", "Cycle"]);
  const start = headered ? 1 : 0;
  const headers = headered ? values[0].map((c) => String(c ?? "").trim()) : [];
  const col = (name: string, fallback: number) =>
    headered && headerIndex(headers, name) >= 0 ? headerIndex(headers, name) : fallback;
  const seen = new Map<string, number>();

  for (let i = start; i < values.length; i++) {
    const row = values[i];
    const rowNumber = i + 1;
    if (!rowHasContent(row)) continue;
    const programId = normalizeProgramId(cell(row, col("ProgramId", 0)));
    const username = normalizeUsername(cell(row, col("Username", 1)));
    const testId = canonicalTestId(cell(row, col("TestId", 2)));
    if (!isValidProgramId(programId) || !username || !testId) {
      issues.push({
        id: `pstate-bad-${rowNumber}`,
        severity: "error",
        tab: "ProgramStudentState",
        rowNumber,
        message: "State row missing ProgramId, Username, or TestId.",
      });
      continue;
    }
    const key = `${programId}::${username}::${testId}`;
    const prev = seen.get(key);
    if (prev) {
      issues.push({
        id: `pstate-dup-${key}`,
        severity: "error",
        tab: "ProgramStudentState",
        rowNumber,
        message: `Duplicate state row for ${username} ${testId} in ${programId} (also row ${prev}).`,
      });
    } else {
      seen.set(key, rowNumber);
    }
    const cycle = asInt(cell(row, col("Cycle", 3)));
    state.push({
      programId,
      username,
      testId,
      cycle: cycle && cycle > 0 ? cycle : 1,
      sitCache: asInt(cell(row, col("SitCache", 4))) || 0,
      updatedAtHst: cell(row, col("UpdatedAtHST", 5)),
      updatedBy: cell(row, col("UpdatedBy", 6)),
      rowNumber,
    });
    if (!cycle || cycle < 1) {
      issues.push({
        id: `pstate-cycle-${rowNumber}`,
        severity: "warn",
        tab: "ProgramStudentState",
        rowNumber,
        message: `Missing cycle for ${username} ${testId}; displaying 1.`,
      });
    }
  }
  return { state, issues };
}

export function defaultProgramId(): string {
  return PROGRAM.legacyDefaultProgramId;
}
