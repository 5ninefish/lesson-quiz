import { TEST_IDS, type TestId } from "../ids";
import type { MissingRow, ResultView, StudentView } from "../types";

export function missingTests(students: StudentView[], results: ResultView[], only?: TestId | null): MissingRow[] {
  const complete = new Set<string>();
  for (const r of results) {
    if (r.complete && r.testId) complete.add(`${r.username}::${r.testId}`);
  }
  const tests = only ? [only] : [...TEST_IDS];
  const rows: MissingRow[] = [];
  for (const s of students) {
    const missing = tests.filter((id) => !complete.has(`${s.username}::${id}`));
    if (missing.length) rows.push({ username: s.username, missing });
  }
  return rows.sort((a, b) => b.missing.length - a.missing.length || a.username.localeCompare(b.username));
}
