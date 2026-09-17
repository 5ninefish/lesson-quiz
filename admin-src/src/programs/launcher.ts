import { PROGRAM } from "../config";
import { TEST_IDS, TEST_TITLES, type TestId } from "../ids";
import type {
  LaunchPlan,
  LaunchPlanRow,
  ProgramStudentView,
  ProgramTestView,
  ProgramView,
  QuestionView,
  ReleaseManual,
  StudentView,
} from "../types";
import { isValidProgramId, minutesToSeconds, normalizeProgramId, suggestProgramId } from "./ids";

export type WizardDraft = {
  programName: string;
  programId: string;
  startAt: string;
  endAt: string;
  status: "DRAFT" | "ACTIVE";
  usernames: string[];
  tests: Array<{
    testId: TestId;
    sortOrder: number;
    manual: ReleaseManual;
    openAt: string;
    closeAt: string;
    maxTries: number;
    timeLimitMinutes: number;
  }>;
  actor: string;
  nowHst: string;
};

export function defaultDraft(name = ""): WizardDraft {
  return {
    programName: name,
    programId: suggestProgramId(name),
    startAt: "",
    endAt: "",
    status: "DRAFT",
    usernames: [],
    tests: [],
    actor: "",
    nowHst: "",
  };
}

export function buildLaunchPlan(opts: {
  draft: WizardDraft;
  existingProgramIds: string[];
  students: StudentView[];
  questions: QuestionView[];
}): LaunchPlan {
  const blocking: string[] = [];
  const warnings: string[] = [];
  const programId = normalizeProgramId(opts.draft.programId);
  const name = opts.draft.programName.trim();
  if (!name) blocking.push("Program name is required.");
  if (!isValidProgramId(programId)) blocking.push("Program ID must be a lowercase slug (letters, numbers, hyphens).");
  if (opts.existingProgramIds.includes(programId)) blocking.push(`Program ID "${programId}" is already used and cannot be reused.`);
  if (opts.draft.startAt && opts.draft.endAt && Date.parse(opts.draft.endAt) < Date.parse(opts.draft.startAt)) {
    blocking.push("End date must follow start date.");
  }
  if (!opts.draft.usernames.length) blocking.push("Select at least one student.");
  if (!opts.draft.tests.length) blocking.push("Select at least one test.");

  const roster = new Set(opts.students.map((s) => s.username));
  for (const u of opts.draft.usernames) {
    if (!roster.has(u)) blocking.push(`Student "${u}" is not in the shared student bank.`);
  }

  const qCount = (id: TestId) => opts.questions.filter((q) => q.testId === id).length;
  for (const t of opts.draft.tests) {
    if (!TEST_IDS.includes(t.testId)) blocking.push(`Unknown test ${t.testId}.`);
    if (qCount(t.testId) === 0) blocking.push(`${TEST_TITLES[t.testId] || t.testId} has no valid questions.`);
    if (!(t.maxTries > 0)) blocking.push(`Max attempts for ${t.testId} must be a positive integer.`);
    if (t.timeLimitMinutes < 0) blocking.push(`Timer for ${t.testId} cannot be negative.`);
  }

  const program: ProgramView = {
    programId,
    programName: name || programId,
    status: opts.draft.status,
    startAt: opts.draft.startAt,
    endAt: opts.draft.endAt,
    createdAtHst: opts.draft.nowHst,
    createdBy: opts.draft.actor,
    updatedAtHst: opts.draft.nowHst,
    updatedBy: opts.draft.actor,
    rowNumber: 0,
  };

  const students: ProgramStudentView[] = opts.draft.usernames.map((username) => ({
    programId,
    username,
    active: true,
    assignedAtHst: opts.draft.nowHst,
    assignedBy: opts.draft.actor,
    rowNumber: 0,
  }));

  const tests: ProgramTestView[] = opts.draft.tests.map((t) => ({
    programId,
    testId: t.testId,
    enabled: true,
    sortOrder: t.sortOrder,
    manual: t.manual,
    openAt: t.openAt,
    closeAt: t.closeAt,
    maxTries: t.maxTries,
    timeLimitSec: minutesToSeconds(t.timeLimitMinutes),
    updatedAtHst: opts.draft.nowHst,
    updatedBy: opts.draft.actor,
    rowNumber: 0,
    title: TEST_TITLES[t.testId],
    state: "open",
    stateLabel: t.manual,
  }));

  const state = students.flatMap((s) =>
    tests.map((t) => ({
      programId,
      username: s.username,
      testId: t.testId,
      cycle: 1,
      sitCache: 0,
      updatedAtHst: opts.draft.nowHst,
      updatedBy: opts.draft.actor,
      rowNumber: 0,
    })),
  );

  const rows: LaunchPlanRow[] = [
    {
      tab: "Programs",
      values: [
        program.programId,
        program.programName,
        program.status,
        program.startAt,
        program.endAt,
        program.createdAtHst,
        program.createdBy,
        program.updatedAtHst,
        program.updatedBy,
      ],
    },
    ...students.map((s) => ({
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
        opts.draft.nowHst,
        opts.draft.actor || "instructor",
        "launch_program",
        `${programId} students=${students.length} tests=${tests.length} state=${state.length}`,
      ],
    },
  ];

  if (programId === PROGRAM.legacyDefaultProgramId) {
    warnings.push("Launching with the reserved Hōkūlani id. Prefer seeding the existing book instead of a second hokulani row.");
  }

  return { program, students, tests, state, rows, blocking, warnings };
}

export function verifyLaunch(expected: LaunchPlan, observed: { programs: ProgramView[]; students: ProgramStudentView[]; tests: ProgramTestView[]; state: { programId: string }[] }): string[] {
  const mismatches: string[] = [];
  const hasProgram = observed.programs.some((p) => p.programId === expected.program.programId);
  if (!hasProgram) mismatches.push(`Programs: expected ${expected.program.programId}, not found.`);
  const students = observed.students.filter((s) => s.programId === expected.program.programId).length;
  if (students !== expected.students.length) mismatches.push(`ProgramStudents: expected ${expected.students.length}, observed ${students}.`);
  const tests = observed.tests.filter((t) => t.programId === expected.program.programId).length;
  if (tests !== expected.tests.length) mismatches.push(`ProgramTests: expected ${expected.tests.length}, observed ${tests}.`);
  const state = observed.state.filter((s) => s.programId === expected.program.programId).length;
  if (state !== expected.state.length) mismatches.push(`ProgramStudentState: expected ${expected.state.length}, observed ${state}.`);
  return mismatches;
}
