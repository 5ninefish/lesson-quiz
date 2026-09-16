import type { DashboardSnapshot } from "../types";
import { parseStudents } from "./students";
import { parseQuestions } from "./questions";
import { parseReleases } from "./releases";
import { parseAttempts } from "./attempts";
import { parseResults } from "./results";
import { parseAudit } from "./audit";
import { bestCompleteScores } from "../reports/best-scores";
import { missingTests } from "../reports/missing-tests";
import { reconcileOrphans } from "../reports/data-health";
import { FORBIDDEN_VIEW_KEYS } from "../config";
import type { SheetValues } from "./cells";

export type RawWorkbook = {
  students: SheetValues;
  questions: SheetValues;
  releases: SheetValues;
  attempts: SheetValues;
  results: SheetValues;
  audit: SheetValues;
};

export function buildSnapshot(raw: RawWorkbook, now = new Date()): DashboardSnapshot {
  const studentsP = parseStudents(raw.students);
  const questionsP = parseQuestions(raw.questions);
  const releasesP = parseReleases(raw.releases, now);
  const attemptsP = parseAttempts(raw.attempts, now);
  const resultsP = parseResults(raw.results);
  const auditP = parseAudit(raw.audit);
  const issues = [
    ...studentsP.issues,
    ...questionsP.issues,
    ...releasesP.issues,
    ...attemptsP.issues,
    ...resultsP.issues,
    ...auditP.issues,
    ...reconcileOrphans(studentsP.students, resultsP.results, attemptsP.attempts),
  ];
  const snap: DashboardSnapshot = {
    fetchedAt: now.toISOString(),
    students: studentsP.students,
    questions: questionsP.questions,
    releases: releasesP.releases,
    attempts: attemptsP.attempts,
    results: resultsP.results,
    audit: auditP.audit,
    issues,
    bestScores: bestCompleteScores(resultsP.results),
    missing: missingTests(studentsP.students, resultsP.results),
    questionCounts: questionsP.counts,
    skippedBlankStudents: studentsP.skippedBlank,
    resultsHeaderMode: resultsP.headerMode,
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
