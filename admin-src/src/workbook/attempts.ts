import { canonicalTestId, normalizeUsername } from "../ids";
import type { AttemptStatus, AttemptView, HealthIssue } from "../types";
import { asInt, cell, headerIndex, looksLikeHeaderRow, rowHasContent, type SheetValues } from "./cells";

const CORRECT_NAMES = ["correctsnapshot", "correct"];

function statusOf(raw: string): AttemptStatus {
  const v = raw.toLowerCase();
  if (v === "in_flight" || v === "in-progress" || v === "in_progress") return "in_flight";
  if (v === "done" || v === "submitted") return "done";
  if (v === "expired") return "expired";
  if (!v) return "malformed";
  return "malformed";
}

export type AttemptsParse = { attempts: AttemptView[]; issues: HealthIssue[] };

export function parseAttempts(values: SheetValues, now = new Date()): AttemptsParse {
  const issues: HealthIssue[] = [];
  const attempts: AttemptView[] = [];
  if (!values.length) return { attempts, issues };

  const headered = looksLikeHeaderRow(values[0], [
    "Username",
    "TestId",
    "SubmissionId",
    "StartedAt",
    "Status",
  ]);
  const start = headered ? 1 : 0;
  const headers = headered ? values[0].map((c) => String(c ?? "").trim()) : [];
  const col = (name: string, fallback: number) =>
    headered && headerIndex(headers, name) >= 0 ? headerIndex(headers, name) : fallback;

  if (headered) {
    for (const h of headers) {
      if (CORRECT_NAMES.includes(h.trim().toLowerCase())) {
        // Column exists; parser must not copy it into views.
      }
    }
  }

  for (let i = start; i < values.length; i++) {
    const row = values[i];
    const rowNumber = i + 1;
    if (!rowHasContent(row)) continue;
    const username = normalizeUsername(cell(row, col("Username", 0)));
    const rawTestId = cell(row, col("TestId", 1));
    const testId = canonicalTestId(rawTestId);
    const submissionId = cell(row, col("SubmissionId", 3));
    const startedAt = cell(row, col("StartedAt", 4));
    const timeLimitSec = asInt(cell(row, col("TimeLimitSec", 5)));
    const status = statusOf(cell(row, col("Status", 9)));
    const cycle = asInt(cell(row, col("Cycle", 2)));
    if (!username) {
      issues.push({
        id: `attempts-nouser-${rowNumber}`,
        severity: "warn",
        tab: "Attempts",
        rowNumber,
        message: "Attempt row missing username.",
      });
    }
    if (!testId) {
      issues.push({
        id: `attempts-testid-${rowNumber}`,
        severity: "error",
        tab: "Attempts",
        rowNumber,
        message: `Unknown assessment id "${rawTestId}".`,
      });
    }

    let deadlineAt: string | null = null;
    let remainingSec: number | null = null;
    let displayStatus: AttemptStatus = status;
    const startedMs = Date.parse(startedAt);
    if (status === "in_flight" && timeLimitSec && timeLimitSec > 0 && !Number.isNaN(startedMs)) {
      const deadline = startedMs + timeLimitSec * 1000;
      deadlineAt = new Date(deadline).toISOString();
      remainingSec = Math.max(0, Math.floor((deadline - now.getTime()) / 1000));
      if (now.getTime() > deadline) displayStatus = "expired";
    }

    const view: AttemptView = {
      username,
      testId,
      cycle,
      submissionId,
      startedAt,
      timeLimitSec,
      status,
      displayStatus,
      deadlineAt,
      remainingSec,
      rowNumber,
      rawTestId,
    };
    const blob = JSON.stringify(view).toLowerCase();
    if (blob.includes("correctsnapshot") || /\bcorrect\b/.test(blob)) {
      throw new Error("attempt view included correct-answer snapshot");
    }
    attempts.push(view);
  }
  return { attempts, issues };
}
