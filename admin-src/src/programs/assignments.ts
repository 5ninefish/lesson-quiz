import type { ProgramTestView, QuestionView } from "../types";
import type { TestId } from "../ids";

export function enabledTestsForProgram(tests: ProgramTestView[], programId: string): ProgramTestView[] {
  return tests
    .filter((t) => t.programId === programId && t.enabled)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.testId.localeCompare(b.testId));
}

export function testAssigned(tests: ProgramTestView[], programId: string, testId: TestId): ProgramTestView | null {
  return tests.find((t) => t.programId === programId && t.testId === testId && t.enabled) || null;
}

export function questionCountFor(questions: QuestionView[], testId: TestId): number {
  return questions.filter((q) => q.testId === testId).length;
}

export function testsWithNoQuestions(tests: ProgramTestView[], questions: QuestionView[]): ProgramTestView[] {
  return tests.filter((t) => t.enabled && questionCountFor(questions, t.testId) === 0);
}
