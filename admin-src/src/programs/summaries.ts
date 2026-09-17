import type { AttemptView, DashboardSnapshot, ProgramSummary, ProgramView } from "../types";
import { missingTestsForProgram } from "../missing/calculate";
import { instructorProgramUrl, studentProgramUrl } from "./urls";

export function summarizeProgram(snap: DashboardSnapshot, program: ProgramView): ProgramSummary {
  const memberships = snap.programStudents.filter((m) => m.programId === program.programId);
  const tests = snap.programTests.filter((t) => t.programId === program.programId);
  const enabled = tests.filter((t) => t.enabled);
  const missing = missingTestsForProgram({
    programId: program.programId,
    memberships: snap.programStudents,
    tests: snap.programTests,
    results: snap.results,
  });
  const attempts = snap.attempts.filter((a) => attemptInProgram(a, program.programId));
  return {
    program,
    assignedStudents: memberships.length,
    activeStudents: memberships.filter((m) => m.active).length,
    assignedTests: tests.length,
    enabledTests: enabled.length,
    openTests: enabled.filter((t) => t.state === "open").length,
    scheduledTests: enabled.filter((t) => t.state === "scheduled").length,
    closedTests: enabled.filter((t) => t.state === "closed").length,
    hiddenTests: enabled.filter((t) => t.state === "hidden").length,
    activeAttempts: attempts.filter((a) => a.displayStatus === "in_flight").length,
    missingStudents: missing.length,
    studentUrl: studentProgramUrl(program.programId),
    instructorUrl: instructorProgramUrl(program.programId),
  };
}

export function attemptInProgram(a: AttemptView, programId: string): boolean {
  if (a.programId) return a.programId === programId;
  return programId === "hokulani";
}

export function filterSnapshot(snap: DashboardSnapshot, programId: string): DashboardSnapshot {
  const memberships = snap.programStudents.filter((m) => m.programId === programId && m.active);
  const names = new Set(memberships.map((m) => m.username));
  const tests = snap.programTests.filter((t) => t.programId === programId);
  const missing = missingTestsForProgram({
    programId,
    memberships: snap.programStudents,
    tests: snap.programTests,
    results: snap.results,
  });
  return {
    ...snap,
    students: snap.students.filter((s) => names.has(s.username)),
    releases: tests.map((t) => ({
      testId: t.testId,
      strand: "Science",
      title: t.title,
      openAt: t.openAt,
      closeAt: t.closeAt,
      manual: t.manual,
      maxTries: t.maxTries,
      timeLimitSec: t.timeLimitSec,
      rowNumber: t.rowNumber,
      state: t.state,
      stateLabel: t.stateLabel,
    })),
    attempts: snap.attempts.filter((a) => attemptInProgram(a, programId)),
    results: snap.results.filter((r) => r.programId === programId),
    missing,
  };
}
