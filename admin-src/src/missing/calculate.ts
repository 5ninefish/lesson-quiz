import type { TestId } from "../ids";
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
      complete.add(`${r.username}::${r.testId}`);
    }
  }
  const rows: MissingRow[] = [];
  for (const m of members) {
    const missing = tests.filter((t) => !complete.has(`${m.username}::${t.testId}`)).map((t) => t.testId);
    if (!missing.length) continue;
    const availability = tests
      .filter((t) => missing.includes(t.testId))
      .map((t) => `${t.testId}:${t.state}`)
      .join(", ");
    rows.push({ username: m.username, missing, availability });
  }
  return rows.sort((a, b) => b.missing.length - a.missing.length || a.username.localeCompare(b.username));
}

export function missingForTest(rows: MissingRow[], testId: TestId): MissingRow[] {
  return rows
    .map((r) => ({ ...r, missing: r.missing.filter((id) => id === testId) }))
    .filter((r) => r.missing.length);
}
