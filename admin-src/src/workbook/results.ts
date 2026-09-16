import { canonicalTestId, normalizeUsername } from "../ids";
import type { HealthIssue, ResultView } from "../types";
import { asInt, cell, headerIndex, looksLikeHeaderRow, rowHasContent, type SheetValues } from "./cells";

const HEADER_CANDIDATES = [
  "Timestamp",
  "Username",
  "TestId",
  "Lesson",
  "Score",
  "SubmissionId",
  "Cycle",
  "Attempt",
  "LifetimeSeq",
];

const TRAILING_LABELS = new Set(
  ["cycle", "lifetimeseq", "submissionid", "status", "complete", "attempt"].map((s) => s),
);

export type ResultsParse = {
  results: ResultView[];
  issues: HealthIssue[];
  headerMode: "header" | "positional" | "empty";
};

function parseScore(raw: string): { num: number | null; den: number | null } {
  const m = String(raw).trim().match(/^(\d+)\s*\/\s*(\d+)$/);
  if (m) return { num: Number(m[1]), den: Number(m[2]) };
  const n = asInt(raw);
  if (n != null) return { num: n, den: null };
  return { num: null, den: null };
}

function answersFrom(row: (string | number | boolean | null)[], start: number, end: number): string[] {
  const out: string[] = [];
  for (let i = start; i < end && i < row.length; i++) {
    const v = cell(row, i);
    const key = v.toLowerCase();
    if (TRAILING_LABELS.has(key)) break;
    out.push(v);
  }
  while (out.length && out[out.length - 1] === "") out.pop();
  return out;
}

function isComplete(answers: string[], den: number | null): boolean {
  const expected = den && den > 0 ? den : answers.length;
  if (expected <= 0) return false;
  if (answers.length < expected) return false;
  for (let i = 0; i < expected; i++) {
    if (!answers[i]) return false;
  }
  return true;
}

export function parseResults(values: SheetValues): ResultsParse {
  const issues: HealthIssue[] = [];
  const results: ResultView[] = [];
  if (!values.length) return { results, issues, headerMode: "empty" };

  const leading = (values[0] || []).slice(0, 12);
  const a0 = cell(values[0], 0);
  const b0 = cell(values[0], 1);
  const looksLikeData =
    (/\d{4}-\d{2}-\d{2}/.test(a0) || (!Number.isNaN(Date.parse(a0)) && a0 !== "")) &&
    b0 !== "" &&
    b0.toLowerCase() !== "username";
  const headered = !looksLikeData && looksLikeHeaderRow(leading, HEADER_CANDIDATES);
  const headerMode = headered ? "header" : "positional";
  const start = headered ? 1 : 0;
  const headers = headered ? values[0].map((c) => String(c ?? "").trim()) : [];
  const col = (name: string, fallback: number) =>
    headered && headerIndex(headers, name) >= 0 ? headerIndex(headers, name) : fallback;

  if (!headered && rowHasContent(values[0])) {
    issues.push({
      id: "results-no-header",
      severity: "warn",
      tab: "Results",
      rowNumber: 1,
      message: "Results row 1 is data, not a header. Parsing positional legacy shape.",
    });
  }

  for (let i = start; i < values.length; i++) {
    const row = values[i];
    const rowNumber = i + 1;
    if (!rowHasContent(row)) continue;

    let username: string;
    let rawTestId: string;
    let timestamp: string;
    let cycle: number | null;
    let lifetimeSeq: number | null;
    let scoreRaw: string;
    let answers: string[];
    let submissionId: string;
    let status: string;
    let source: ResultView["source"];

    if (headered) {
      source = "headered";
      username = normalizeUsername(cell(row, col("Username", 1)));
      rawTestId = cell(row, col("TestId", 2)) || cell(row, col("Lesson", 2));
      timestamp = cell(row, col("Timestamp", 0));
      cycle = asInt(cell(row, col("Cycle", 3)));
      lifetimeSeq = asInt(cell(row, col("LifetimeSeq", 4))) ?? asInt(cell(row, col("Attempt", 4)));
      scoreRaw = cell(row, col("Score", 5));
      const q1 = headerIndex(headers, "Q1");
      const answerStart = q1 >= 0 ? q1 : 6;
      answers = answersFrom(row, answerStart, row.length);
      submissionId = cell(row, col("SubmissionId", 11));
      status = cell(row, col("Status", 12));
    } else {
      source = "positional";
      timestamp = cell(row, 0);
      username = normalizeUsername(cell(row, 1));
      rawTestId = cell(row, 2);
      lifetimeSeq = asInt(cell(row, 3));
      scoreRaw = cell(row, 4);
      answers = answersFrom(row, 5, Math.min(row.length, 19));
      cycle = null;
      submissionId = "";
      status = "";
      for (let c = 19; c < row.length; c++) {
        const v = cell(row, c);
        const prev = cell(values[0], c).toLowerCase();
        if (prev === "cycle") cycle = asInt(v) ?? cycle;
        if (prev === "lifetimeseq" || prev === "attempt") lifetimeSeq = asInt(v) ?? lifetimeSeq;
        if (prev === "submissionid") submissionId = v || submissionId;
        if (prev === "status") status = v || status;
      }
    }

    if (!username && !rawTestId && !scoreRaw) {
      issues.push({
        id: `results-skip-${rowNumber}`,
        severity: "info",
        tab: "Results",
        rowNumber,
        message: "Skipped nonblank row that could not be parsed as a result.",
      });
      continue;
    }

    const testId = canonicalTestId(rawTestId);
    if (!testId) {
      issues.push({
        id: `results-testid-${rowNumber}`,
        severity: "error",
        tab: "Results",
        rowNumber,
        message: `Unknown assessment id "${rawTestId}".`,
      });
    }
    const { num, den } = parseScore(scoreRaw);
    const complete = isComplete(answers, den);
    results.push({
      username,
      testId,
      rawTestId,
      timestamp,
      cycle,
      lifetimeSeq,
      scoreNum: num,
      scoreDen: den,
      answers,
      complete,
      submissionId,
      status,
      rowNumber,
      source,
    });
  }

  return { results, issues, headerMode };
}
