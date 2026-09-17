import type { DashboardSnapshot } from "../types";
import { parseStudents } from "./students";
import { parseQuestions } from "./questions";
import { parseReleases } from "./releases";
import { parseAttempts } from "./attempts";
import { parseResults } from "./results";
import { parseAudit } from "./audit";
import { bestCompleteScores } from "../reports/best-scores";
import { missingTests } from "../reports/missing-tests";
import { missingTestsForProgram } from "../missing/calculate";
import { reconcileOrphans } from "../reports/data-health";
import { FORBIDDEN_VIEW_KEYS, PROGRAM, PROGRAM_TABLES } from "../config";
import type { SheetValues } from "./cells";
import { parsePrograms, parseProgramStudents, parseProgramStudentState, parseProgramTests } from "../programs/parser";
import { attributeResults, countByAttribution } from "../programs/attribution";

export type RawWorkbook = {
  students: SheetValues;
  questions: SheetValues;
  releases: SheetValues;
  attempts: SheetValues;
  results: SheetValues;
  audit: SheetValues;
  programs?: SheetValues;
  programStudents?: SheetValues;
  programTests?: SheetValues;
  programStudentState?: SheetValues;
};

export function buildSnapshot(raw: RawWorkbook, now = new Date()): DashboardSnapshot {
  const studentsP = parseStudents(raw.students);
  const questionsP = parseQuestions(raw.questions);
  const releasesP = parseReleases(raw.releases, now);
  const attemptsP = parseAttempts(raw.attempts, now);
  const resultsP = parseResults(raw.results);
  const auditP = parseAudit(raw.audit);
  const programsP = parsePrograms(raw.programs || []);
  const membershipsP = parseProgramStudents(raw.programStudents || []);
  const programTestsP = parseProgramTests(raw.programTests || [], now);
  const stateP = parseProgramStudentState(raw.programStudentState || []);
  const attributed = attributeResults(resultsP.results, attemptsP.attempts);
  const missingProgramTables = PROGRAM_TABLES.filter((tab) => {
    if (tab === "Programs") return !(raw.programs && raw.programs.length);
    if (tab === "ProgramStudents") return !(raw.programStudents && raw.programStudents.length);
    if (tab === "ProgramTests") return !(raw.programTests && raw.programTests.length);
    return !(raw.programStudentState && raw.programStudentState.length);
  });
  const programTablesPresent = missingProgramTables.length === 0;
  const tableIssues = programTablesPresent
    ? []
    : missingProgramTables.map((tab) => ({
        id: `missing-tab-${tab}`,
        severity: "warn" as const,
        tab,
        rowNumber: null,
        message: `${tab} is missing. Editors can Initialize Program Launcher. Never run setup().`,
      }));
  const issues = [
    ...studentsP.issues,
    ...questionsP.issues,
    ...releasesP.issues,
    ...attemptsP.issues,
    ...resultsP.issues,
    ...auditP.issues,
    ...programsP.issues,
    ...membershipsP.issues,
    ...programTestsP.issues,
    ...stateP.issues,
    ...tableIssues,
    ...reconcileOrphans(studentsP.students, attributed, attemptsP.attempts),
  ];
  const missing = programTablesPresent
    ? missingTestsForProgram({
        programId: PROGRAM.legacyDefaultProgramId,
        memberships: membershipsP.memberships,
        tests: programTestsP.tests,
        results: attributed,
      })
    : missingTests(studentsP.students, attributed);
  const snap: DashboardSnapshot = {
    fetchedAt: now.toISOString(),
    students: studentsP.students,
    questions: questionsP.questions,
    releases: releasesP.releases,
    attempts: attemptsP.attempts,
    results: attributed,
    audit: auditP.audit,
    issues,
    bestScores: bestCompleteScores(attributed),
    missing,
    questionCounts: questionsP.counts,
    skippedBlankStudents: studentsP.skippedBlank,
    resultsHeaderMode: resultsP.headerMode,
    programs: programsP.programs,
    programStudents: membershipsP.memberships,
    programTests: programTestsP.tests,
    programState: stateP.state,
    programTablesPresent,
    missingProgramTables,
    legacyAttributedResults: countByAttribution(attributed, "legacy_default"),
    unassignedResults: countByAttribution(attributed, "unassigned"),
  };
  assertSafeSnapshot(snap);
  return snap;
}

export function assertSafeSnapshot(snap: DashboardSnapshot): void {
  const blob = JSON.stringify(snap).toLowerCase();
  for (const key of FORBIDDEN_VIEW_KEYS) {
    if (blob.includes(`"${key}"`)) {
      throw new Error(`forbidden key leaked into snapshot: ${key}`);
    }
  }
}
