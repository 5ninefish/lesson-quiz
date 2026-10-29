import { describe, expect, it } from "vitest";
import { lessonRecords, lessonWorkText } from "./lesson-status";
import { PUBLISHED_LESSONS } from "../teaching";
import type { LessonProgressView, ProgramLessonView, ProgramStudentView, ResultView } from "../types";

const packs = PUBLISHED_LESSONS;

function student(username: string, active = true): ProgramStudentView {
  return { programId: "teach-field", username, active, assignedAtHst: "", assignedBy: "", rowNumber: 2 };
}

function lesson(lessonId: string, enabled: boolean, sortOrder: number): ProgramLessonView {
  return {
    programId: "teach-field",
    lessonId,
    enabled,
    sortOrder,
    lessonVersion: "2026-10",
    openAt: "",
    closeAt: "",
    updatedAtHst: "",
    updatedBy: "",
    requirePre: lessonId !== "sci-sust@2026-10",
    rowNumber: 2,
  };
}

function progress(partial: Partial<LessonProgressView> & Pick<LessonProgressView, "username" | "lessonId" | "topicId" | "status">): LessonProgressView {
  return {
    programId: "teach-field",
    lessonVersion: "2026-10",
    artifact: "",
    support: false,
    updatedAt: "2026-10-28T10:00:00.000Z",
    ...partial,
  };
}

function result(partial: Partial<ResultView> & Pick<ResultView, "username" | "rawTestId" | "phase">): ResultView {
  return {
    testId: partial.rawTestId as ResultView["testId"],
    timestamp: "",
    cycle: 1,
    lifetimeSeq: 1,
    scoreNum: 3,
    scoreDen: 5,
    answers: [],
    complete: true,
    submissionId: "",
    status: "done",
    rowNumber: 2,
    source: "headered",
    programId: "teach-field",
    attribution: "explicit",
    ...partial,
  };
}

const healthTopics = ["start", "heart", "method", "rest", "move", "data", "community", "wrap"];
const sustTopics = ["start", "coral", "species", "harm", "record", "shape", "change", "wrap"];

describe("lesson records", () => {
  const lessons = [
    lesson("sci-health@2026-10", true, 2),
    lesson("sci-sust@2026-10", true, 5),
    lesson("sci-cs@2026-10", false, 1),
  ];

  it("reports not started, in progress, completed, missing assessment, and support", () => {
    const records = lessonRecords({
      programId: "teach-field",
      students: [student("walkada"), student("preview"), student("gone", false)],
      lessons,
      progress: [
        progress({ username: "preview", lessonId: "sci-health@2026-10", topicId: "start", status: "place", artifact: "opened" }),
        ...sustTopics.map((topicId) => progress({
          username: "preview",
          lessonId: "sci-sust@2026-10",
          topicId,
          status: topicId === "wrap" ? "support" : "met",
          support: topicId === "wrap",
          artifact: topicId === "coral" ? "animal and algae" : "saved",
        })),
      ],
      results: [
        result({ username: "preview", rawTestId: "SCI-CORAL", phase: "SINGLE", programId: "preview" }),
        result({ username: "preview", rawTestId: "SCI-HEALTH", phase: "PRE" }),
      ],
      packs,
    });
    expect(records.map((row) => row.username)).toEqual(["preview", "preview", "walkada", "walkada"]);
    expect(records.map((row) => `${row.title}:${row.progress}:${row.assessment}:${row.support}`)).toEqual([
      "Health:In progress:POST missing:",
      "Sustainability:Lesson completed:Assessment missing:Needs support",
      "Health:Not started:Assessment missing:",
      "Sustainability:Not started:Assessment missing:",
    ]);
    expect(records[1].work.find((topic) => topic.topicId === "coral")?.artifact).toBe("animal and algae");
    expect(lessonWorkText(records[2])).toBe("No saved work yet.");
    expect(lessonWorkText(records[1])).toContain("wrap — support — Needs support");
    expect(JSON.stringify(records)).not.toContain("SCI-CORAL");
  });

  it("records both phases and ignores a result from another program", () => {
    const done = healthTopics.map((topicId) => progress({
      username: "preview",
      lessonId: "sci-health@2026-10",
      topicId,
      status: "met",
      artifact: "kept",
    }));
    const records = lessonRecords({
      programId: "teach-field",
      students: [student("preview")],
      lessons: [lesson("sci-health@2026-10", true, 1)],
      progress: done,
      results: [
        result({ username: "preview", rawTestId: "SCI-HEALTH", phase: "PRE", programId: "teach-cs" }),
        result({ username: "preview", rawTestId: "SCI-HEALTH", phase: "PRE" }),
        result({ username: "preview", rawTestId: "SCI-HEALTH", phase: "POST" }),
        result({ username: "preview", rawTestId: "SCI-HEALTH", phase: "POST", complete: false }),
      ],
      packs,
    });
    expect(records[0].progress).toBe("Lesson completed");
    expect(records[0].assessment).toBe("PRE and POST recorded");
    expect(records[0].support).toBe("");
  });
});
