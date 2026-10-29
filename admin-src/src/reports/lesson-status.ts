import type { LessonProgressView, ProgramLessonView, ProgramStudentView, ResultView } from "../types";
import type { PublishedLesson } from "../teaching";

export type LessonProgressLabel = "Not started" | "In progress" | "Lesson completed";
export type LessonAssessmentLabel = "Assessment missing" | "PRE missing" | "POST missing" | "PRE and POST recorded";

export type LessonWorkTopic = {
  topicId: string;
  status: string;
  support: boolean;
  artifact: string;
  updatedAt: string;
};

export type LessonRecord = {
  username: string;
  lessonId: string;
  title: string;
  progress: LessonProgressLabel;
  assessment: LessonAssessmentLabel;
  support: "" | "Needs support";
  work: LessonWorkTopic[];
};

const DONE = new Set(["met", "support"]);
const RANK: Record<string, number> = { met: 4, support: 4, needs_rubric: 2, place: 1 };

function better(next: LessonProgressView, current: LessonProgressView): boolean {
  const nextRank = RANK[next.status] || 0;
  const currentRank = RANK[current.status] || 0;
  return nextRank > currentRank || (nextRank === currentRank && next.updatedAt > current.updatedAt);
}

function assessmentLabel(pack: PublishedLesson, results: ResultView[], username: string, programId: string): LessonAssessmentLabel {
  if (!pack.linked || !pack.assessmentId) return "Assessment missing";
  const want = pack.assessmentId.toUpperCase();
  const hits = results.filter((row) => {
    if (!row.complete) return false;
    if (row.username !== username || row.programId !== programId) return false;
    const id = String(row.testId || row.rawTestId || "").toUpperCase();
    return id === want;
  });
  const hasPre = hits.some((row) => row.phase === "PRE");
  const hasPost = hits.some((row) => row.phase === "POST");
  if (hasPre && hasPost) return "PRE and POST recorded";
  if (hasPre) return "POST missing";
  if (hasPost) return "PRE missing";
  return "Assessment missing";
}

export function lessonRecords(input: {
  programId: string;
  students: ProgramStudentView[];
  lessons: ProgramLessonView[];
  progress: LessonProgressView[];
  results: ResultView[];
  packs: PublishedLesson[];
}): LessonRecord[] {
  const packs = new Map(input.packs.map((pack) => [pack.lessonId, pack]));
  const enabled = input.lessons
    .filter((row) => row.programId === input.programId && row.enabled && packs.has(row.lessonId))
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.lessonId.localeCompare(b.lessonId));
  const students = input.students
    .filter((row) => row.programId === input.programId && row.active && row.username)
    .map((row) => row.username)
    .filter((name, index, all) => all.indexOf(name) === index)
    .sort((a, b) => a.localeCompare(b));
  const records: LessonRecord[] = [];
  for (const username of students) {
    for (const lesson of enabled) {
      const pack = packs.get(lesson.lessonId)!;
      const rows = input.progress.filter((row) => row.programId === input.programId && row.username === username && row.lessonId === lesson.lessonId);
      const byTopic = new Map<string, LessonProgressView>();
      for (const row of rows) {
        const current = byTopic.get(row.topicId);
        if (!current || better(row, current)) byTopic.set(row.topicId, row);
      }
      const done = [...byTopic.values()].filter((row) => DONE.has(row.status)).length;
      const progress: LessonProgressLabel = rows.length === 0 ? "Not started" : done >= pack.topicCount ? "Lesson completed" : "In progress";
      const needsSupport = rows.some((row) => row.status === "support" || row.support);
      const work = [...byTopic.values()]
        .sort((a, b) => a.topicId.localeCompare(b.topicId))
        .map((row) => ({
          topicId: row.topicId,
          status: row.status,
          support: row.status === "support" || row.support,
          artifact: row.artifact,
          updatedAt: row.updatedAt,
        }));
      records.push({
        username,
        lessonId: lesson.lessonId,
        title: pack.title,
        progress,
        assessment: assessmentLabel(pack, input.results, username, input.programId),
        support: needsSupport ? "Needs support" : "",
        work,
      });
    }
  }
  return records;
}

export function lessonWorkText(record: LessonRecord): string {
  if (!record.work.length) return "No saved work yet.";
  return record.work.map((topic) => {
    const flag = topic.support ? "Needs support" : "No support flag";
    const saved = topic.artifact || "(no saved text)";
    return `${topic.topicId} — ${topic.status} — ${flag}\n${saved}`;
  }).join("\n\n");
}
