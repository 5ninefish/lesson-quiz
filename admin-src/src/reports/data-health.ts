import type { AttemptView, HealthIssue, ResultView, StudentView } from "../types";

export function reconcileOrphans(
  students: StudentView[],
  results: ResultView[],
  attempts: AttemptView[],
): HealthIssue[] {
  const issues: HealthIssue[] = [];
  const roster = new Set(students.map((s) => s.username));
  const attemptsBySub = new Map(attempts.filter((a) => a.submissionId).map((a) => [a.submissionId, a]));
  const resultsBySub = new Set(results.filter((r) => r.submissionId).map((r) => r.submissionId));

  for (const r of results) {
    if (!roster.has(r.username) && r.username) {
      issues.push({
        id: `orphan-student-result-${r.rowNumber}`,
        severity: "warn",
        tab: "Results",
        rowNumber: r.rowNumber,
        message: `Result username "${r.username}" is not on the populated roster.`,
      });
    }
    if (r.submissionId && !attemptsBySub.has(r.submissionId)) {
      issues.push({
        id: `orphan-result-${r.rowNumber}`,
        severity: "warn",
        tab: "Results",
        rowNumber: r.rowNumber,
        message: `Result has no matching attempt (submission ${r.submissionId}).`,
      });
    }
    if (!r.submissionId && r.complete) {
      issues.push({
        id: `orphan-result-nosub-${r.rowNumber}`,
        severity: "info",
        tab: "Results",
        rowNumber: r.rowNumber,
        message: "Complete result has no submission id; cannot link an attempt.",
      });
    }
  }

  for (const a of attempts) {
    if ((a.displayStatus === "done" || a.status === "done") && a.submissionId && !resultsBySub.has(a.submissionId)) {
      issues.push({
        id: `orphan-attempt-${a.rowNumber}`,
        severity: "warn",
        tab: "Attempts",
        rowNumber: a.rowNumber,
        message: `Done attempt ${a.submissionId} has no matching result.`,
      });
    }
  }
  return issues;
}
