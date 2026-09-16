import type { AuditView, HealthIssue } from "../types";
import { cell, headerIndex, looksLikeHeaderRow, rowHasContent, type SheetValues } from "./cells";

export function parseAudit(values: SheetValues): { audit: AuditView[]; issues: HealthIssue[] } {
  const issues: HealthIssue[] = [];
  const audit: AuditView[] = [];
  if (!values.length) return { audit, issues };
  const headered = looksLikeHeaderRow(values[0], ["TimestampHST", "Actor", "Action", "Detail"]);
  const start = headered ? 1 : 0;
  const headers = headered ? values[0].map((c) => String(c ?? "").trim()) : [];
  const col = (name: string, fallback: number) =>
    headered && headerIndex(headers, name) >= 0 ? headerIndex(headers, name) : fallback;
  for (let i = start; i < values.length; i++) {
    const row = values[i];
    if (!rowHasContent(row)) continue;
    audit.push({
      timestamp: cell(row, col("TimestampHST", 0)),
      actor: cell(row, col("Actor", 1)),
      action: cell(row, col("Action", 2)),
      detail: cell(row, col("Detail", 3)),
      rowNumber: i + 1,
    });
  }
  return { audit, issues };
}
