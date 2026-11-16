import { describe, expect, it } from "vitest";
import { loadCode } from "./codegs-harness";
import { makeBook } from "./mock-workbook";

describe("wrap apply fallback", () => {
  it("records needs_rubric when /grade is down and lets the student proceed", () => {
    const live = makeBook([
      ["Students", [
        ["Username", "Email", "Password", "L1", "L2", "L3", "L4", "L5", "L6", "CycleL1", "CycleL2", "CycleL3", "CycleL4", "CycleL5", "CycleL6"],
        ["ada", "ada@example.edu", "secret", 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1],
      ]],
      ["Questions", [["Lesson", "Q#", "Question", "A", "B", "C", "D", "E", "F", "Correct"]]],
      ["Releases", [["TestId", "Strand", "Title", "OpenAt", "CloseAt", "Manual", "MaxTries", "TimeLimitSec"]]],
      ["Attempts", [["Username", "TestId", "Cycle", "SubmissionId", "StartedAt", "TimeLimitSec", "MaxTriesSnapshot", "QuestionFingerprint", "CorrectSnapshot", "Status", "QuestionsSnapshot"]]],
      ["Results", [["TimestampHST"]]],
      ["Audit", [["TimestampHST", "Actor", "Action", "Detail"]]],
      ["Programs", [
        ["ProgramId", "ProgramName", "Status", "StartAt", "EndAt", "CreatedAtHST", "CreatedBy", "UpdatedAtHST", "UpdatedBy"],
        ["preview", "Preview", "ACTIVE", "", "", "", "", "", ""],
      ]],
      ["ProgramStudents", [
        ["ProgramId", "Username", "Active", "AssignedAtHST", "AssignedBy"],
        ["preview", "ada", "TRUE", "", ""],
      ]],
      ["ProgramTests", [["ProgramId", "TestId", "Enabled", "SortOrder", "Manual", "OpenAt", "CloseAt", "MaxTries", "TimeLimitSec", "UpdatedAtHST", "UpdatedBy"]]],
      ["ProgramStudentState", [["ProgramId", "Username", "TestId", "Cycle", "SitCache", "UpdatedAtHST", "UpdatedBy"]]],
    ]);
    const links = live.insertSheet("ProgramLessons");
    links.appendRow(["ProgramId", "LessonId", "Enabled", "SortOrder", "LessonVersion", "OpenAt", "CloseAt", "UpdatedAtHST", "UpdatedBy", "RequirePre"]);
    links.appendRow(["preview", "ment-interviews@2026-10", "TRUE", "1", "2026-10", "", "", "", "editor", "NO"]);
    const code = loadCode(live) as unknown as {
      lessonProgressPost_: (body: unknown) => { getContent: () => string };
      regradeAiUnavailable_: () => void;
      UrlFetchApp: { fetch: (url: string) => { getResponseCode: () => number; getContentText: () => string } };
    };
    const before = live.getSheetByName("Attempts")!.getLastRow();
    code.UrlFetchApp.fetch = () => {
      throw new Error("grade down");
    };
    const saved = JSON.parse(code.lessonProgressPost_({
      action: "lesson_progress",
      username: "ada",
      password: "secret",
      programId: "preview",
      lessonId: "ment-interviews@2026-10",
      topicId: "wrap",
      mode: "attempt",
      evidence: {
        why: "Interview practice can lead to a job or an internship.",
        share: "I would ask my cousin one question and let them try it.",
        culture: "I would read the organization goals and connect a family garden log.",
        apply: "I would apply even if I am not fully qualified, and I would say which skill I can learn.",
      },
    }).getContent());
    expect(saved.ok).toBe(true);
    expect(saved.status).toBe("needs_rubric");
    expect(saved.reason).toBe("ai_unavailable");
    expect(saved.error).toBeUndefined();
    expect(live.getSheetByName("Attempts")!.getLastRow()).toBe(before);
    const row = live.getSheetByName("LessonProgress")!.grid.find((item) => item[4] === "wrap");
    expect(row?.[5]).toBe("needs_rubric");
    expect(String(row?.[6] || "")).toContain("ai_unavailable");
    code.regradeAiUnavailable_();
    const still = live.getSheetByName("LessonProgress")!.grid.find((item) => item[4] === "wrap");
    expect(still?.[5]).toBe("needs_rubric");
    expect(String(still?.[6] || "")).toContain("ai_unavailable");
  });
});
