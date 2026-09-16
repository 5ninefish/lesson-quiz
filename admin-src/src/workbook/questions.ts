import { canonicalTestId, type TestId } from "../ids";
import type { HealthIssue, QuestionView } from "../types";
import { cell, headerIndex, looksLikeHeaderRow, rowHasContent, type SheetValues } from "./cells";

export type QuestionsParse = {
  questions: QuestionView[];
  counts: Record<TestId, number>;
  issues: HealthIssue[];
};

export function parseQuestions(values: SheetValues): QuestionsParse {
  const issues: HealthIssue[] = [];
  const questions: QuestionView[] = [];
  const counts = {} as Record<TestId, number>;
  if (!values.length) return { questions, counts, issues };

  const headered = looksLikeHeaderRow(values[0], ["Lesson", "Question", "Q#", "A", "B"]);
  const start = headered ? 1 : 0;
  const headers = headered ? values[0].map((c) => String(c ?? "").trim()) : [];
  const lessonCol = headered && headerIndex(headers, "Lesson") >= 0 ? headerIndex(headers, "Lesson") : 0;
  const numCol = headered && headerIndex(headers, "Q#") >= 0 ? headerIndex(headers, "Q#") : 1;
  const promptCol = headered && headerIndex(headers, "Question") >= 0 ? headerIndex(headers, "Question") : 2;
  const optStart = headered && headerIndex(headers, "A") >= 0 ? headerIndex(headers, "A") : 3;

  const seenBoth = new Set<string>();

  for (let i = start; i < values.length; i++) {
    const row = values[i];
    const rowNumber = i + 1;
    if (!rowHasContent(row)) continue;
    const rawLesson = cell(row, lessonCol);
    const testId = canonicalTestId(rawLesson);
    if (!testId) {
      issues.push({
        id: `questions-unknown-${rowNumber}`,
        severity: "error",
        tab: "Questions",
        rowNumber,
        message: `Unknown assessment id "${rawLesson}".`,
      });
      continue;
    }
    const key = `${testId}:${rawLesson}`;
    seenBoth.add(key);
    const options: string[] = [];
    for (let o = 0; o < 6; o++) {
      const v = cell(row, optStart + o);
      if (v) options.push(v);
    }
    questions.push({
      testId,
      number: cell(row, numCol) || String(questions.filter((q) => q.testId === testId).length + 1),
      prompt: cell(row, promptCol),
      options,
      rowNumber,
    });
    counts[testId] = (counts[testId] || 0) + 1;
  }

  const byTest = new Map<TestId, Set<string>>();
  for (let i = start; i < values.length; i++) {
    const raw = cell(values[i], lessonCol);
    const id = canonicalTestId(raw);
    if (!id) continue;
    const set = byTest.get(id) || new Set<string>();
    set.add(raw.trim().toUpperCase());
    byTest.set(id, set);
  }
  for (const [id, set] of byTest) {
    const hasLegacy = [...set].some((s) => /^L[1-6]$/.test(s));
    const hasCanon = [...set].some((s) => s.startsWith("SCI-"));
    if (hasLegacy && hasCanon) {
      issues.push({
        id: `questions-mixed-${id}`,
        severity: "error",
        tab: "Questions",
        rowNumber: null,
        message: `${id} has both legacy and canonical identifiers in the question bank.`,
      });
    }
  }

  return { questions, counts, issues };
}
