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
import { isValidProgramId, minutesToSeconds, normalizeProgramId, phaseOf, suggestProgramId, type AssessmentPhase } from "./ids";

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
    phase?: AssessmentPhase;
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
  const seenAssignments = new Set<string>();
  for (const t of opts.draft.tests) {
    if (!TEST_IDS.includes(t.testId)) blocking.push(`Unknown test ${t.testId}.`);
    if (qCount(t.testId) === 0) blocking.push(`${TEST_TITLES[t.testId] || t.testId} has no valid questions.`);
    if (!Number.isInteger(t.maxTries) || t.maxTries < 1) blocking.push(`Max attempts for ${t.testId} must be a positive integer.`);
    if (t.timeLimitMinutes < 0 || !Number.isFinite(t.timeLimitMinutes)) blocking.push(`Timer for ${t.testId} cannot be negative.`);
    const key = `${t.testId}|${phaseOf(t.phase)}`;
    if (seenAssignments.has(key)) blocking.push(`Duplicate assignment ${t.testId} ${phaseOf(t.phase)}.`);
    seenAssignments.add(key);
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
    phase: phaseOf(t.phase),
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
      phase: t.phase,
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

export function verifyLaunch(expected: LaunchPlan, observed: {
  programs: ProgramView[];
  students: ProgramStudentView[];
  tests: ProgramTestView[];
  state: Array<{ programId: string; username?: string; testId?: string; phase?: string; cycle?: number; manual?: string; maxTries?: number; timeLimitSec?: number; sortOrder?: number }>;
}): string[] {
  const mismatches: string[] = [];
  const program = observed.programs.find((p) => p.programId === expected.program.programId);
  if (!program) mismatches.push(`Programs: expected ${expected.program.programId}, not found.`);
  else {
    if (program.programName !== expected.program.programName) mismatches.push(`Program name: expected ${expected.program.programName}, observed ${program.programName}.`);
    if (program.status !== expected.program.status) mismatches.push(`Program status: expected ${expected.program.status}, observed ${program.status}.`);
  }
  for (const student of expected.students) {
    const hit = observed.students.find((row) => row.programId === student.programId && row.username === student.username && row.active);
    if (!hit) mismatches.push(`ProgramStudents missing ${student.username}.`);
  }
  for (const test of expected.tests) {
    const hit = observed.tests.find((row) => row.programId === test.programId && row.testId === test.testId && phaseOf(row.phase) === phaseOf(test.phase));
    if (!hit) mismatches.push(`ProgramTests missing ${test.testId} ${phaseOf(test.phase)}.`);
    else if (hit.manual !== test.manual || hit.maxTries !== test.maxTries || hit.timeLimitSec !== test.timeLimitSec || hit.sortOrder !== test.sortOrder) {
      mismatches.push(`ProgramTests ${test.testId} ${phaseOf(test.phase)} policy did not match.`);
    }
  }
  for (const row of expected.state) {
    const hit = observed.state.find((item) => item.programId === row.programId && item.username === row.username && item.testId === row.testId && phaseOf(item.phase) === phaseOf(row.phase));
    if (!hit) mismatches.push(`ProgramStudentState missing ${row.username} ${row.testId} ${phaseOf(row.phase)}.`);
    else if (hit.cycle != null && row.cycle != null && hit.cycle !== row.cycle) mismatches.push(`ProgramStudentState cycle for ${row.testId} ${phaseOf(row.phase)} did not match.`);
  }
  return mismatches;
}
