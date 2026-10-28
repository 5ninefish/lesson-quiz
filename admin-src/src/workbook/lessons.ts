import { FORBIDDEN_VIEW_KEYS } from "../config";
import type { LessonCatalogView, LessonProgressView, ProgramLessonView } from "../types";
import type { SheetValues } from "./cells";

function headerIndex(headers: string[], name: string): number {
  const want = name.toLowerCase();
  return headers.findIndex((cell) => cell.trim().toLowerCase() === want);
}

function cell(row: string[], index: number): string {
  return index >= 0 ? String(row[index] ?? "").trim() : "";
}

function safeArtifact(raw: string): string {
  let text = raw.slice(0, 240);
  for (const key of FORBIDDEN_VIEW_KEYS) text = text.split(`"${key}"`).join('"note"');
  return text;
}

export function parseLessonCatalog(rows: SheetValues): LessonCatalogView[] {
  if (!rows.length) return [];
  const headers = rows[0].map((value) => String(value ?? ""));
  const idCol = headerIndex(headers, "LessonId");
  if (idCol < 0 && String(rows[0][0] ?? "").trim() !== "LessonId") return [];
  const titleCol = headerIndex(headers, "Title");
  const versionCol = headerIndex(headers, "Version");
  const urlCol = headerIndex(headers, "URL");
  const statusCol = headerIndex(headers, "Status");
  const out: LessonCatalogView[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i].map((value) => String(value ?? ""));
    const lessonId = cell(row, idCol >= 0 ? idCol : 0);
    if (!lessonId) continue;
    out.push({
      lessonId,
      title: cell(row, titleCol >= 0 ? titleCol : 1),
      version: cell(row, versionCol >= 0 ? versionCol : 2),
      url: cell(row, urlCol >= 0 ? urlCol : 3),
      status: cell(row, statusCol >= 0 ? statusCol : 4),
    });
  }
  return out;
}

export function parseProgramLessons(rows: SheetValues): ProgramLessonView[] {
  if (!rows.length) return [];
  const headers = rows[0].map((value) => String(value ?? ""));
  if (headerIndex(headers, "LessonId") < 0 && String(rows[0][0] ?? "").trim() !== "ProgramId") return [];
  const col = (name: string, fallback: number) => {
    const found = headerIndex(headers, name);
    return found >= 0 ? found : fallback;
  };
  const out: ProgramLessonView[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i].map((value) => String(value ?? ""));
    const programId = cell(row, col("ProgramId", 0)).toLowerCase();
    const lessonId = cell(row, col("LessonId", 1));
    if (!programId || !lessonId) continue;
    const enabledRaw = cell(row, col("Enabled", 2)).toUpperCase();
    const requireRaw = cell(row, col("RequirePre", 9)).toUpperCase();
    out.push({
      programId,
      lessonId,
      enabled: !(enabledRaw === "FALSE" || enabledRaw === "0" || enabledRaw === "NO"),
      sortOrder: Number(cell(row, col("SortOrder", 3))) || 0,
      lessonVersion: cell(row, col("LessonVersion", 4)),
      openAt: cell(row, col("OpenAt", 5)),
      closeAt: cell(row, col("CloseAt", 6)),
      updatedAtHst: cell(row, col("UpdatedAtHST", 7)),
      updatedBy: cell(row, col("UpdatedBy", 8)),
      requirePre: requireRaw === "YES" || requireRaw === "TRUE" || requireRaw === "1",
      rowNumber: i + 1,
    });
  }
  return out;
}

export function parseLessonProgress(rows: SheetValues): LessonProgressView[] {
  if (!rows.length) return [];
  const headers = rows[0].map((value) => String(value ?? ""));
  if (headerIndex(headers, "TopicId") < 0 && String(rows[0][0] ?? "").trim() !== "ProgramId") return [];
  const col = (name: string, fallback: number) => {
    const found = headerIndex(headers, name);
    return found >= 0 ? found : fallback;
  };
  const out: LessonProgressView[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i].map((value) => String(value ?? ""));
    const programId = cell(row, col("ProgramId", 0)).toLowerCase();
    const username = cell(row, col("Username", 1)).toLowerCase();
    const lessonId = cell(row, col("LessonId", 2));
    const topicId = cell(row, col("TopicId", 4));
    if (!programId || !username || !lessonId || !topicId) continue;
    out.push({
      programId,
      username,
      lessonId,
      lessonVersion: cell(row, col("LessonVersion", 3)),
      topicId,
      status: cell(row, col("Status", 5)),
      artifact: safeArtifact(cell(row, col("Artifact", 6))),
      support: cell(row, col("SupportFlag", 7)).toUpperCase() === "YES",
      updatedAt: cell(row, col("UpdatedAt", 8)),
    });
  }
  return out;
}
