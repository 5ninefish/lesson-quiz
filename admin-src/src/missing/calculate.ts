import type { TestId } from "../ids";
import { phaseOf } from "../programs/ids";
import type { MissingRow, ProgramStudentView, ProgramTestView, ResultView } from "../types";

export function missingTestsForProgram(opts: {
  programId: string;
  memberships: ProgramStudentView[];
  tests: ProgramTestView[];
  results: ResultView[];
}): MissingRow[] {
  const members = opts.memberships.filter((m) => m.programId === opts.programId && m.active);
  const tests = opts.tests
    .filter((t) => t.programId === opts.programId && t.enabled)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const complete = new Set<string>();
  for (const r of opts.results) {
    if (r.complete && r.testId && r.programId === opts.programId) {
      complete.add(`${r.username}::${r.testId}::${phaseOf(r.phase)}`);
    }
  }
  const rows: MissingRow[] = [];
  for (const m of members) {
    const missingTests = tests.filter((t) => !complete.has(`${m.username}::${t.testId}::${phaseOf(t.phase)}`));
    if (!missingTests.length) continue;
    const missing = missingTests.map((t) => t.testId);
    const phases = missingTests.map((t) => phaseOf(t.phase));
    const availability = missingTests.map((t) => `${t.testId}${phaseOf(t.phase) === "SINGLE" ? "" : `:${phaseOf(t.phase)}`}:${t.state}`).join(", ");
    rows.push({ username: m.username, missing, phases, availability });
  }
  return rows.sort((a, b) => b.missing.length - a.missing.length || a.username.localeCompare(b.username));
}

export function missingForTest(rows: MissingRow[], testId: TestId): MissingRow[] {
  return rows
    .map((r) => ({ ...r, missing: r.missing.filter((id) => id === testId) }))
    .filter((r) => r.missing.length);
}
