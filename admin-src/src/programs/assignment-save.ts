import type { TestId } from "../ids";
import type { ProgramStudentView, ProgramTestView } from "../types";
import type { WizardDraft } from "./launcher";
import { minutesToSeconds } from "./ids";

export type AssignmentUpdate = {
  appends: Array<{ tab: string; values: string[][] }>;
  updates: Array<{ range: string; values: string[][] }>;
  addedStudents: string[];
  removedStudents: string[];
  addedTests: string[];
  removedTests: string[];
  blocking: string[];
};

export function planAssignmentUpdate(opts: {
  programId: string;
  draft: WizardDraft;
  memberships: ProgramStudentView[];
  programTests: ProgramTestView[];
}): AssignmentUpdate {
  const blocking: string[] = [];
  const nextUsers = new Set(opts.draft.usernames);
  const nextTests = new Set(opts.draft.tests.map((t) => t.testId));
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

  const testById = new Map(currentTests.map((t) => [t.testId, t]));
  opts.draft.tests.forEach((t, i) => {
    const row = testById.get(t.testId as TestId);
    if (!row) {
      addedTests.push(t.testId);
      appends.push({
        tab: "ProgramTests",
        values: [[
          opts.programId,
          t.testId,
          "TRUE",
          String(t.sortOrder || i + 1),
          t.manual,
          t.openAt,
          t.closeAt,
          String(t.maxTries),
          String(minutesToSeconds(t.timeLimitMinutes)),
          opts.draft.nowHst,
          opts.draft.actor,
        ]],
      });
    } else if (!row.enabled) {
      addedTests.push(t.testId);
      updates.push({ range: `ProgramTests!C${row.rowNumber}`, values: [["TRUE"]] });
    }
  });
  for (const row of currentTests) {
    if (row.enabled && !nextTests.has(row.testId)) {
      removedTests.push(row.testId);
      updates.push({ range: `ProgramTests!C${row.rowNumber}`, values: [["FALSE"]] });
    }
  }

  appends.push({
    tab: "Audit",
    values: [[
      opts.draft.nowHst,
      opts.draft.actor,
      "edit_assignments",
      `${opts.programId} +students=${addedStudents.length} -students=${removedStudents.length} +tests=${addedTests.length} -tests=${removedTests.length}`,
    ]],
  });

  return { appends, updates, addedStudents, removedStudents, addedTests, removedTests, blocking };
}
