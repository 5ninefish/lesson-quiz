import { PROGRAM } from "../config";
import { LESSON_TO_TEST, TEST_TITLES, canonicalTestId } from "../ids";
import { getAccessToken } from "../auth/google-token";
import { copyWorkbookId, executeSpreadsheetRequests } from "./batch-write";

function lessonNote(lessonOrTest: string): string {
  const testId = canonicalTestId(lessonOrTest) || LESSON_TO_TEST[lessonOrTest as keyof typeof LESSON_TO_TEST];
  if (!testId) return "";
  return `${TEST_TITLES[testId]} (${testId})`;
}

function noteRequest(sheetId: number, row: number, col: number, note: string) {
  return {
    updateCells: {
      rows: [{ values: [{ note }] }],
      fields: "note",
      range: {
        sheetId,
        startRowIndex: row,
        endRowIndex: row + 1,
        startColumnIndex: col,
        endColumnIndex: col + 1,
      },
    },
  };
}

async function sheetIds(): Promise<Record<string, number>> {
  const token = getAccessToken();
  if (!token) return {};
  const id = copyWorkbookId();
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties(sheetId,title)`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return {};
  const json = await res.json();
  const out: Record<string, number> = {};
  for (const s of json.sheets || []) {
    const title = s.properties?.title;
    const sheetId = s.properties?.sheetId;
    if (title != null && sheetId != null) out[title] = sheetId;
  }
  return out;
}

async function values(range: string): Promise<string[][]> {
  const token = getAccessToken();
  if (!token) return [];
  const id = copyWorkbookId();
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(range)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return [];
  const json = await res.json();
  return json.values || [];
}

export async function applyLessonTitleNotes(): Promise<{ ok: true } | { ok: false; code: string }> {
  if (String(PROGRAM.spreadsheetId) === String(PROGRAM.liveStudentSpreadsheetId)) {
    return { ok: false, code: "permission" };
  }
  const ids = await sheetIds();
  const requests: ReturnType<typeof noteRequest>[] = [];

  const students = await values("Students!1:1");
  const studentHeaders = students[0] || [];
  const studentsId = ids.Students;
  if (studentsId != null) {
    studentHeaders.forEach((raw, col) => {
      const h = String(raw || "").trim();
      const lesson = h.replace(/^Cycle/i, "");
      const note = lessonNote(lesson);
      if (note) requests.push(noteRequest(studentsId, 0, col, note));
    });
  }

  const questions = await values("Questions!A:A");
  const questionsId = ids.Questions;
  if (questionsId != null) {
    questions.forEach((row, i) => {
      const note = lessonNote(String(row[0] || ""));
      if (note) requests.push(noteRequest(questionsId, i, 0, note));
    });
  }

  const releases = await values("Releases!A:A");
  const releasesId = ids.Releases;
  if (releasesId != null) {
    releases.forEach((row, i) => {
      const note = lessonNote(String(row[0] || ""));
      if (note) requests.push(noteRequest(releasesId, i, 0, note));
    });
  }

  const programTests = await values("ProgramTests!A:B");
  const programTestsId = ids.ProgramTests;
  if (programTestsId != null) {
    programTests.forEach((row, i) => {
      const note = lessonNote(String(row[1] || ""));
      if (note) requests.push(noteRequest(programTestsId, i, 1, note));
    });
  }

  if (!requests.length) return { ok: true };
  return executeSpreadsheetRequests(requests);
}
