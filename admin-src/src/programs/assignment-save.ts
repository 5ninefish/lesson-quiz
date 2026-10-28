import type { TestId } from "../ids";
import type { ProgramStateView, ProgramStudentView, ProgramTestView, ProgramView } from "../types";
import type { WizardDraft } from "./launcher";
import { minutesToSeconds, phaseOf } from "./ids";

export type AssignmentUpdate = {
  appends: Array<{ tab: string; values: string[][] }>;
  updates: Array<{ range: string; values: string[][] }>;
  addedStudents: string[];
  removedStudents: string[];
  addedTests: string[];
  removedTests: string[];
  addedState: number;
  blocking: string[];
};

function stateKey(programId: string, username: string, testId: string, phase?: string): string {
  return `${programId}\t${username}\t${testId}\t${phaseOf(phase)}`;
}

export function planProgramConfigUpdate(
  program: ProgramView,
  draft: WizardDraft,
): { range: string; values: string[][] } | null {
  const name = draft.programName.trim();
  const same =
    program.programName === name &&
    program.status === draft.status &&
    program.startAt === draft.startAt &&
    program.endAt === draft.endAt;
  if (same || !program.rowNumber) return null;
  return {
    range: `Programs!B${program.rowNumber}:I${program.rowNumber}`,
    values: [[
      name,
      draft.status,
      draft.startAt,
      draft.endAt,
      program.createdAtHst,
      program.createdBy,
      draft.nowHst,
      draft.actor,
    ]],
  };
}

export function planAssignmentUpdate(opts: {
  programId: string;
  draft: WizardDraft;
  memberships: ProgramStudentView[];
  programTests: ProgramTestView[];
  state: ProgramStateView[];
}): AssignmentUpdate {
  const blocking: string[] = [];
  const nextUsers = new Set(opts.draft.usernames);
  const nextTests = new Set(opts.draft.tests.map((t) => `${t.testId}|${phaseOf(t.phase)}`));
  if (!nextUsers.size) blocking.push("Select at least one student.");
  if (!nextTests.size) blocking.push("Select at least one test.");

  const currentMembers = opts.memberships.filter((m) => m.programId === opts.programId);
  const currentTests = opts.programTests.filter((t) => t.programId === opts.programId);
  const appends: AssignmentUpdate["appends"] = [];
  const updates: AssignmentUpdate["updates"] = [];
  const addedStudents: string[] = [];
  const removedStudents: string[] = [];
  const addedTests: string[] = [];
  const removedTests: string[] = [];

  const memberByUser = new Map(currentMembers.map((m) => [m.username, m]));
  for (const username of nextUsers) {
    const row = memberByUser.get(username);
    if (!row) {
      addedStudents.push(username);
      appends.push({
        tab: "ProgramStudents",
        values: [[opts.programId, username, "TRUE", opts.draft.nowHst, opts.draft.actor]],
      });
    } else if (!row.active) {
      addedStudents.push(username);
      updates.push({
        range: `ProgramStudents!C${row.rowNumber}`,
        values: [["TRUE"]],
      });
    }
  }
  for (const row of currentMembers) {
    if (row.active && !nextUsers.has(row.username)) {
      removedStudents.push(row.username);
      updates.push({
        range: `ProgramStudents!C${row.rowNumber}`,
        values: [["FALSE"]],
      });
    }
  }

  const testById = new Map(currentTests.map((t) => [`${t.testId}|${phaseOf(t.phase)}`, t]));
  opts.draft.tests.forEach((t, i) => {
    const row = testById.get(`${t.testId}|${phaseOf(t.phase)}`);
    const sort = String(t.sortOrder || i + 1);
    const limit = String(minutesToSeconds(t.timeLimitMinutes));
    if (!row) {
      addedTests.push(t.testId);
      appends.push({
        tab: "ProgramTests",
        values: [[
          opts.programId,
          t.testId,
          "TRUE",
          sort,
          t.manual,
          t.openAt,
          t.closeAt,
          String(t.maxTries),
          limit,
          opts.draft.nowHst,
          opts.draft.actor,
        ]],
      });
      return;
    }
    const desired = [
      opts.programId,
      t.testId,
      "TRUE",
      sort,
      t.manual,
      t.openAt,
      t.closeAt,
      String(t.maxTries),
      limit,
    ];
    const current = [
      row.programId,
      row.testId,
      row.enabled ? "TRUE" : "FALSE",
      String(row.sortOrder),
      row.manual,
      row.openAt,
      row.closeAt,
      String(row.maxTries),
      String(row.timeLimitSec),
    ];
    if (desired.some((value, idx) => value !== current[idx])) {
      if (!row.enabled) addedTests.push(t.testId);
      updates.push({
        range: `ProgramTests!A${row.rowNumber}:K${row.rowNumber}`,
        values: [[...desired, opts.draft.nowHst, opts.draft.actor]],
      });
    }
  });
  for (const row of currentTests) {
    if (row.enabled && !nextTests.has(`${row.testId}|${phaseOf(row.phase)}`)) {
      removedTests.push(row.testId);
      updates.push({ range: `ProgramTests!C${row.rowNumber}`, values: [["FALSE"]] });
    }
  }

  const seen = new Set(
    opts.state
      .filter((s) => s.programId === opts.programId)
      .map((s) => stateKey(s.programId, s.username, s.testId, s.phase)),
  );
  const stateRows: string[][] = [];
  for (const username of nextUsers) {
    for (const t of opts.draft.tests) {
      const key = stateKey(opts.programId, username, t.testId, t.phase);
      if (seen.has(key)) continue;
      seen.add(key);
      stateRows.push([opts.programId, username, t.testId, "1", "0", opts.draft.nowHst, opts.draft.actor, phaseOf(t.phase)]);
    }
  }
  if (stateRows.length) appends.push({ tab: "ProgramStudentState", values: stateRows });

  if (!blocking.length && (updates.length || appends.length)) {
    appends.push({
      tab: "Audit",
      values: [[
        opts.draft.nowHst,
        opts.draft.actor,
        "edit_assignments",
        `${opts.programId} +students=${addedStudents.length} -students=${removedStudents.length} +tests=${addedTests.length} -tests=${removedTests.length} +state=${stateRows.length}`,
      ]],
    });
  }

  return {
    appends,
    updates,
    addedStudents,
    removedStudents,
    addedTests,
    removedTests,
    addedState: stateRows.length,
    blocking,
  };
}
