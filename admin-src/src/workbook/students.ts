import { TEST_IDS, type TestId, normalizeUsername } from "../ids";
import type { HealthIssue, StudentView } from "../types";
import { asInt, cell, headerIndex, looksLikeHeaderRow, rowHasContent, type SheetValues } from "./cells";

const HEADER_NAMES = [
  "Username",
  "PasswordHash",
  "Password",
  "CycleL1",
  "L1",
];

export type StudentsParse = {
  students: StudentView[];
  skippedBlank: number;
  issues: HealthIssue[];
};

export function parseStudents(values: SheetValues): StudentsParse {
  const issues: HealthIssue[] = [];
  const students: StudentView[] = [];
  const seen = new Map<string, number>();
  let skippedBlank = 0;
  if (!values.length) {
    issues.push({
      id: "students-empty",
      severity: "warn",
      tab: "Students",
      rowNumber: null,
      message: "Students tab is empty.",
    });
    return { students, skippedBlank, issues };
  }

  const headered =
    cell(values[0], 0).toLowerCase() === "username" || looksLikeHeaderRow(values[0], HEADER_NAMES);
  const start = headered ? 1 : 0;
  const headers = headered ? values[0].map((c) => String(c ?? "").trim()) : [];
  const userCol = headered && headerIndex(headers, "Username") >= 0 ? headerIndex(headers, "Username") : 0;
  const emailCol = headered ? headerIndex(headers, "Email") : -1;
  const sit0 = headered && headerIndex(headers, "L1") >= 0 ? headerIndex(headers, "L1") : 2;
  const cycle0 = headered && headerIndex(headers, "CycleL1") >= 0 ? headerIndex(headers, "CycleL1") : 8;

  for (let i = start; i < values.length; i++) {
    const row = values[i];
    const rowNumber = i + 1;
    if (!rowHasContent(row)) {
      skippedBlank += 1;
      continue;
    }
    const username = normalizeUsername(cell(row, userCol));
    if (!username) {
      skippedBlank += 1;
      continue;
    }
    const prev = seen.get(username);
    if (prev) {
      issues.push({
        id: `students-dup-${username}`,
        severity: "error",
        tab: "Students",
        rowNumber,
        message: `Duplicate username "${username}" (also row ${prev}).`,
      });
    } else {
      seen.set(username, rowNumber);
    }

    const sits = {} as Record<TestId, number | null>;
    const cycles = {} as Record<TestId, number | null>;
    TEST_IDS.forEach((id, li) => {
      const sitRaw = cell(row, sit0 + li);
      const cycleRaw = cell(row, cycle0 + li);
      sits[id] = sitRaw === "" ? null : asInt(sitRaw);
      if (cycleRaw === "") {
        cycles[id] = 1;
        issues.push({
          id: `students-cycle-missing-${rowNumber}-${id}`,
          severity: "warn",
          tab: "Students",
          rowNumber,
          message: `Missing Cycle for ${id}; displaying cycle 1.`,
        });
      } else {
        const n = asInt(cycleRaw);
        if (n == null || n < 1) {
          cycles[id] = 1;
          issues.push({
            id: `students-cycle-bad-${rowNumber}-${id}`,
            severity: "warn",
            tab: "Students",
            rowNumber,
            message: `Malformed Cycle for ${id} (${cycleRaw}); displaying cycle 1.`,
          });
        } else {
          cycles[id] = n;
        }
      }
    });

    students.push({ username, email: emailCol >= 0 ? cell(row, emailCol) : "", rowNumber, sits, cycles });
  }

  return { students, skippedBlank, issues };
}

export function assertNoSecretsInStudents(students: StudentView[]): void {
  const blob = JSON.stringify(students).toLowerCase();
  if (blob.includes("password") || blob.includes("hash")) {
    throw new Error("student view leaked credential-shaped keys");
  }
}
