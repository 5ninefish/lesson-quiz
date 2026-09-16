import { TEST_TITLES, canonicalTestId, type TestId } from "../ids";
import type { HealthIssue, ReleaseManual, ReleaseView } from "../types";
import { asInt, cell, headerIndex, looksLikeHeaderRow, rowHasContent, type SheetValues } from "./cells";

function asManual(raw: string): ReleaseManual {
  const v = raw.toUpperCase();
  if (v === "OPEN" || v === "CLOSED" || v === "AUTO") return v;
  return "UNSET";
}

export function evaluateRelease(
  rel: Pick<ReleaseView, "manual" | "openAt" | "closeAt">,
  now: Date,
): Pick<ReleaseView, "state" | "stateLabel"> {
  if (rel.manual === "OPEN") return { state: "open", stateLabel: "Open (manual)" };
  if (rel.manual === "CLOSED") return { state: "closed", stateLabel: "Closed (manual)" };
  if (rel.manual === "UNSET") return { state: "open", stateLabel: "Open (legacy UNSET)" };
  if (!rel.openAt) return { state: "hidden", stateLabel: "Hidden (AUTO, no open time)" };
  const open = Date.parse(rel.openAt);
  const close = rel.closeAt ? Date.parse(rel.closeAt) : NaN;
  if (Number.isNaN(open)) return { state: "malformed", stateLabel: "Malformed open time" };
  if (rel.closeAt && Number.isNaN(close)) return { state: "malformed", stateLabel: "Malformed close time" };
  if (now.getTime() < open) return { state: "scheduled", stateLabel: "Scheduled" };
  if (!Number.isNaN(close) && now.getTime() > close) return { state: "closed", stateLabel: "Closed (window)" };
  return { state: "open", stateLabel: "Open (window)" };
}

export type ReleasesParse = { releases: ReleaseView[]; issues: HealthIssue[] };

export function parseReleases(values: SheetValues, now = new Date()): ReleasesParse {
  const issues: HealthIssue[] = [];
  const releases: ReleaseView[] = [];
  if (!values.length) return { releases, issues };

  const headered = looksLikeHeaderRow(values[0], ["TestId", "Strand", "Title", "Manual", "OpenAt"]);
  const start = headered ? 1 : 0;
  const headers = headered ? values[0].map((c) => String(c ?? "").trim()) : [];
  const col = (name: string, fallback: number) =>
    headered && headerIndex(headers, name) >= 0 ? headerIndex(headers, name) : fallback;

  const seen = new Map<TestId, number>();
  for (let i = start; i < values.length; i++) {
    const row = values[i];
    const rowNumber = i + 1;
    if (!rowHasContent(row)) continue;
    const rawId = cell(row, col("TestId", 0));
    const testId = canonicalTestId(rawId);
    if (!testId) {
      issues.push({
        id: `releases-unknown-${rowNumber}`,
        severity: "error",
        tab: "Releases",
        rowNumber,
        message: `Unknown assessment id "${rawId}".`,
      });
      continue;
    }
    const prev = seen.get(testId);
    if (prev) {
      issues.push({
        id: `releases-dup-${testId}`,
        severity: "error",
        tab: "Releases",
        rowNumber,
        message: `Duplicate release row for ${testId} (also row ${prev}).`,
      });
    } else {
      seen.set(testId, rowNumber);
    }
    const title = cell(row, col("Title", 2)) || TEST_TITLES[testId];
    const openAt = cell(row, col("OpenAt", 3));
    const closeAt = cell(row, col("CloseAt", 4));
    const manual = asManual(cell(row, col("Manual", 5)));
    const maxTries = asInt(cell(row, col("MaxTries", 6)));
    const timeLimitSec = asInt(cell(row, col("TimeLimitSec", 7)));
    const ev = evaluateRelease({ manual, openAt, closeAt }, now);
    if (openAt && closeAt && Date.parse(closeAt) <= Date.parse(openAt)) {
      issues.push({
        id: `releases-window-${rowNumber}`,
        severity: "error",
        tab: "Releases",
        rowNumber,
        message: "Close time is not after open time.",
      });
    }
    releases.push({
      testId,
      strand: cell(row, col("Strand", 1)) || "Science",
      title,
      openAt,
      closeAt,
      manual,
      maxTries,
      timeLimitSec,
      rowNumber,
      ...ev,
    });
  }
  return { releases, issues };
}
