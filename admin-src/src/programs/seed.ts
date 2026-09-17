import { PROGRAM } from "../config";
import { TEST_IDS, type TestId } from "../ids";
import type { LaunchPlan, ProgramStudentView, ProgramTestView, ReleaseView, StudentView } from "../types";

export type SeedReport = {
  populatedStudents: number;
  memberships: number;
  programTests: number;
  stateRows: number;
  duplicateStudents: number;
  unknownTests: number;
  missingCyclesDefaulted: number;
  blocking: string[];
};

export function seedHokulaniPlan(opts: {
  students: StudentView[];
  releases: ReleaseView[];
  actor: string;
  nowHst: string;
}): { plan: LaunchPlan; report: SeedReport } {
  const unique = new Map<string, StudentView>();
  let duplicateStudents = 0;
  for (const s of opts.students) {
    if (unique.has(s.username)) duplicateStudents += 1;
    else unique.set(s.username, s);
  }
  const populated = [...unique.values()];
  let missingCyclesDefaulted = 0;
  const memberships: ProgramStudentView[] = populated.map((s) => ({
    programId: PROGRAM.legacyDefaultProgramId,
    username: s.username,
    active: true,
    assignedAtHst: opts.nowHst,
    assignedBy: opts.actor,
    rowNumber: 0,
  }));
  const known = new Set(opts.releases.map((r) => r.testId));
  const unknownTests = TEST_IDS.filter((id) => !known.has(id)).length;
  const tests: ProgramTestView[] = opts.releases.map((r, i) => ({
    programId: PROGRAM.legacyDefaultProgramId,
    testId: r.testId,
    enabled: true,
    sortOrder: i + 1,
    manual: r.manual,
    openAt: r.openAt,
    closeAt: r.closeAt,
    maxTries: r.maxTries && r.maxTries > 0 ? r.maxTries : 2,
    timeLimitSec: r.timeLimitSec && r.timeLimitSec > 0 ? r.timeLimitSec : 0,
    updatedAtHst: opts.nowHst,
    updatedBy: opts.actor,
    rowNumber: r.rowNumber,
    title: r.title,
    state: r.state,
    stateLabel: r.stateLabel,
  }));
  const state = populated.flatMap((s) =>
    tests.map((t) => {
      const cycle = s.cycles[t.testId];
      if (cycle == null) missingCyclesDefaulted += 1;
      return {
        programId: PROGRAM.legacyDefaultProgramId,
        username: s.username,
        testId: t.testId,
        cycle: cycle && cycle > 0 ? cycle : 1,
        sitCache: s.sits[t.testId] || 0,
        updatedAtHst: opts.nowHst,
        updatedBy: opts.actor,
        rowNumber: 0,
      };
    }),
  );
  const blocking: string[] = [];
  if (!populated.length) blocking.push("No populated students to seed.");
  if (!tests.length) blocking.push("No Releases rows to seed as ProgramTests.");
  const plan: LaunchPlan = {
    program: {
      programId: PROGRAM.legacyDefaultProgramId,
      programName: "Hōkūlani",
      status: "ACTIVE",
      startAt: "",
      endAt: "",
      createdAtHst: opts.nowHst,
      createdBy: opts.actor,
      updatedAtHst: opts.nowHst,
      updatedBy: opts.actor,
      rowNumber: 0,
    },
    students: memberships,
    tests,
    state,
    rows: [
      {
        tab: "Programs",
        values: [
          PROGRAM.legacyDefaultProgramId,
          "Hōkūlani",
          "ACTIVE",
          "",
          "",
          opts.nowHst,
          opts.actor,
          opts.nowHst,
          opts.actor,
        ],
      },
      ...memberships.map((s) => ({
        tab: "ProgramStudents",
        values: [s.programId, s.username, "TRUE", s.assignedAtHst, s.assignedBy],
      })),
      ...tests.map((t) => ({
        tab: "ProgramTests",
        values: [
          t.programId,
          t.testId,
          "TRUE",
          String(t.sortOrder),
          t.manual,
          t.openAt,
          t.closeAt,
          String(t.maxTries),
          String(t.timeLimitSec),
          t.updatedAtHst,
          t.updatedBy,
        ],
      })),
      ...state.map((s) => ({
        tab: "ProgramStudentState",
        values: [s.programId, s.username, s.testId, String(s.cycle), String(s.sitCache), s.updatedAtHst, s.updatedBy],
      })),
      {
        tab: "Audit",
        values: [
          opts.nowHst,
          opts.actor,
          "seed_hokulani",
          `students=${memberships.length} tests=${tests.length} state=${state.length}`,
        ],
      },
    ],
    blocking,
    warnings: unknownTests ? [`${unknownTests} canonical tests have no Releases row.`] : [],
  };
  return {
    plan,
    report: {
      populatedStudents: populated.length,
      memberships: memberships.length,
      programTests: tests.length,
      stateRows: state.length,
      duplicateStudents,
      unknownTests,
      missingCyclesDefaulted,
      blocking,
    },
  };
}

export function expectedStatePairs(studentCount: number, testIds: TestId[]): number {
  return studentCount * testIds.length;
}
