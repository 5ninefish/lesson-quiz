import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadCode } from "./codegs-harness";
import { makeBook } from "./mock-workbook";

function questions(lesson: string, count: number): string[][] {
  const rows = [["Lesson", "Q#", "Question", "A", "B", "C", "D", "E", "F", "Correct"]];
  for (let i = 1; i <= count; i++) rows.push([lesson, String(i), `Prompt ${i}`, "Alpha", "Beta", "Gamma", "Delta", "", "", "A"]);
  return rows;
}

function legacyResult(): string[] {
  const row = new Array(24).fill("");
  row[0] = "2026-09-15T18:04:00-10:00";
  row[1] = "old.student";
  row[2] = "L1";
  row[3] = "1";
  row[4] = "4/5";
  row[5] = "A";
  row[6] = "B";
  row[7] = "C";
  row[8] = "A";
  row[9] = "B";
  row[19] = "Cycle";
  row[20] = "LifetimeSeq";
  row[21] = "SubmissionId";
  row[22] = "Status";
  row[23] = "Complete";
  return row;
}

function book() {
  const q = questions("L3", 6).concat(questions("L1", 15).slice(1));
  return makeBook([
    ["Students", [
      ["Username", "Email", "Password", "L1", "L2", "L3", "L4", "L5", "L6", "CycleL1", "CycleL2", "CycleL3", "CycleL4", "CycleL5", "CycleL6"],
      ["ada", "ada@example.edu", "secret", 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1],
      ["bee", "bee@example.edu", "other", 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1],
    ]],
    ["Questions", q],
    ["Releases", [["TestId", "Strand", "Title", "OpenAt", "CloseAt", "Manual", "MaxTries", "TimeLimitSec"]]],
    ["Attempts", [["Username", "TestId", "Cycle", "SubmissionId", "StartedAt", "TimeLimitSec", "MaxTriesSnapshot", "QuestionFingerprint", "CorrectSnapshot", "Status", "QuestionsSnapshot"]]],
    ["Results", [legacyResult()]],
    ["Audit", [["TimestampHST", "Actor", "Action", "Detail"]]],
    ["Programs", [["ProgramId", "ProgramName", "Status", "StartAt", "EndAt", "CreatedAtHST", "CreatedBy", "UpdatedAtHST", "UpdatedBy"]]],
    ["ProgramStudents", [["ProgramId", "Username", "Active", "AssignedAtHST", "AssignedBy"]]],
    ["ProgramTests", [["ProgramId", "TestId", "Enabled", "SortOrder", "Manual", "OpenAt", "CloseAt", "MaxTries", "TimeLimitSec", "UpdatedAtHST", "UpdatedBy"]]],
    ["ProgramStudentState", [["ProgramId", "Username", "TestId", "Cycle", "SitCache", "UpdatedAtHST", "UpdatedBy"]]],
  ]);
}

function payload(code: ReturnType<typeof loadCode>, value: unknown): Record<string, unknown> {
  return (code as unknown as { json: (v: { getContent?: () => string }) => Record<string, unknown> }).json(value as { getContent?: () => string });
}

describe("Apps Script dashboard contract", () => {
  it("runs the two-program synthetic operating flow on the legacy results shape", () => {
    const live = book();
    const code = loadCode(live) as unknown as Record<string, (...args: unknown[]) => { getContent?: () => string }>;
    const batches = () => (code.batchCounter as unknown as { n: number }).n;

    const denied = payload(code as unknown as ReturnType<typeof loadCode>, code.commandPost_({ accessToken: "viewer-token", command: "ping" }));
    expect(denied.ok).toBe(false);
    const expired = payload(code as unknown as ReturnType<typeof loadCode>, code.commandPost_({ accessToken: "expired-token", command: "ping" }));
    expect(expired.ok).toBe(false);
    const ping = payload(code as unknown as ReturnType<typeof loadCode>, code.commandPost_({ accessToken: "editor-token", command: "ping" }));
    expect(ping).toMatchObject({ ok: true, actor: "editor@example.edu", canEdit: true });

    const failBook = book();
    const failCode = loadCode(failBook) as unknown as { commandPost_: (b: unknown) => { getContent?: () => string } };
    const failedLaunch = payload(failCode as unknown as ReturnType<typeof loadCode>, failCode.commandPost_({
      accessToken: "editor-failbatch",
      mutationId: "fail-1",
      command: "launch_program",
      program: { programId: "program-a", programName: "Program A", status: "ACTIVE" },
      students: [{ username: "ada" }, { username: "bee" }],
      tests: [{ testId: "SCI-CS", phase: "SINGLE", sortOrder: 1, manual: "UNSET", maxTries: 2, timeLimitSec: 30 }],
    }));
    expect(failedLaunch.ok).toBe(false);
    expect(failBook.getSheetByName("Programs")?.grid.length).toBe(1);
    const noScope = payload(code as unknown as ReturnType<typeof loadCode>, code.commandPost_({
      accessToken: "editor-noscope",
      mutationId: "noscope-1",
      command: "launch_program",
      program: { programId: "program-a", programName: "Program A", status: "ACTIVE" },
      students: [{ username: "ada" }, { username: "bee" }],
      tests: [{ testId: "SCI-CS", phase: "SINGLE", maxTries: 2, timeLimitSec: 0 }],
    }));
    expect(noScope.ok).toBe(false);
    expect(live.getSheetByName("Programs")?.grid.length).toBe(1);
    void batches;

    const launch = (id: string, name: string, tests: unknown[], students: { username: string }[]) => payload(code as unknown as ReturnType<typeof loadCode>, code.commandPost_({
      accessToken: "editor-token",
      mutationId: `launch-${id}`,
      command: "launch_program",
      program: { programId: id, programName: name, status: "ACTIVE" },
      students,
      tests,
    }));
    expect(launch("program-a", "Program A", [
      { testId: "SCI-CS", phase: "PRE", sortOrder: 1, manual: "UNSET", maxTries: 2, timeLimitSec: 30 },
      { testId: "SCI-CS", phase: "POST", sortOrder: 2, manual: "UNSET", maxTries: 2, timeLimitSec: 0 },
    ], [{ username: "ada" }]).ok).toBe(true);
    expect(launch("program-b", "Program B", [
      { testId: "SCI-SOIL", phase: "SINGLE", sortOrder: 1, manual: "AUTO", openAt: "2099-01-01T00:00:00-10:00", closeAt: "", maxTries: 1, timeLimitSec: 0 },
    ], [{ username: "bee" }]).ok).toBe(true);
    const duplicate = payload(code as unknown as ReturnType<typeof loadCode>, code.commandPost_({
      accessToken: "editor-token",
      mutationId: "launch-program-a-again",
      command: "launch_program",
      program: { programId: "program-a", programName: "Program A", status: "ACTIVE" },
      students: [{ username: "ada" }],
      tests: [{ testId: "SCI-CS", phase: "PRE", sortOrder: 1, manual: "UNSET", maxTries: 2, timeLimitSec: 30 }],
    }));
    expect(duplicate.ok).toBe(false);
    expect(duplicate.error).toBe("stale");

    const replay = payload(code as unknown as ReturnType<typeof loadCode>, code.commandPost_({
      accessToken: "editor-token",
      mutationId: "launch-program-a",
      command: "launch_program",
      program: { programId: "program-a", programName: "Duplicate", status: "ACTIVE" },
      students: [{ username: "ada" }, { username: "bee" }],
      tests: [{ testId: "SCI-CS", phase: "PRE", maxTries: 2, timeLimitSec: 30 }],
    }));
    expect(replay.replayed).toBe(true);
    expect(live.getSheetByName("Programs")?.grid.filter((row) => row[0] === "program-a").length).toBe(1);

    const started = payload(code as unknown as ReturnType<typeof loadCode>, code.authAndLoad("ada", "secret", "SCI-CS", "program-a", "PRE"));
    expect(started.ok).toBe(true);
    expect(started.submissionId).toBeTruthy();
    expect(started).not.toHaveProperty("score");
    const submissionId = String(started.submissionId);
    const beforeClose = (code.batchCounter as unknown as { n: number }).n;

    const closed = payload(code as unknown as ReturnType<typeof loadCode>, code.commandPost_({
      accessToken: "editor-token",
      mutationId: "close-pre",
      command: "save_release",
      programId: "program-a",
      testId: "SCI-CS",
      phase: "PRE",
      manual: "CLOSED",
      openAt: "",
      closeAt: "",
      maxTries: 2,
      timeLimitSec: 30,
      expected: { manual: "UNSET", openAt: "", closeAt: "", maxTries: "2", timeLimitSec: "30" },
    }));
    expect(closed.ok).toBe(true);

    const resumed = payload(code as unknown as ReturnType<typeof loadCode>, code.authAndLoad("ada", "secret", "SCI-CS", "program-a", "PRE"));
    expect(resumed.submissionId).toBe(submissionId);
    expect((resumed.questions as unknown[]).length).toBe(6);

    for (const row of live.getSheetByName("Questions")?.grid || []) {
      if (row[0] === "L3") row[9] = "B";
    }
    const answers: Record<string, string> = {};
    for (let i = 1; i <= 6; i++) answers[String(i)] = "A";
    const submitted = payload(code as unknown as ReturnType<typeof loadCode>, code.submit("ada", "secret", "SCI-CS", answers, submissionId, "program-a", "PRE"));
    expect(submitted.ok).toBe(true);
    expect(submitted.complete).toBe(true);
    expect(submitted).not.toHaveProperty("score");
    const afterSubmit = (code.batchCounter as unknown as { n: number }).n;
    expect(afterSubmit).toBe(beforeClose + 2);

    const again = payload(code as unknown as ReturnType<typeof loadCode>, code.submit("ada", "secret", "SCI-CS", answers, submissionId, "program-a", "PRE"));
    expect(again.ok).toBe(true);
    expect((code.batchCounter as unknown as { n: number }).n).toBe(afterSubmit);
    const results = live.getSheetByName("Results")?.grid || [];
    const matches = results.filter((row) => row.join(" ").includes(submissionId));
    expect(matches.length).toBe(1);
    expect(results[0][1]).toBe("old.student");
    expect(results[0][4]).toBe("4/5");
    const saved = matches[0];
    expect(saved[1]).toBe("ada");
    expect(saved[2]).toBe("SCI-CS");
    expect(saved[4]).toBe("6/6");
    const jsonCol = results[0].findIndex((cell) => cell === "AnswersJson");
    expect(JSON.parse(saved[jsonCol])).toEqual(["A", "A", "A", "A", "A", "A"]);
    expect(saved[results[0].findIndex((cell) => cell === "ProgramId")]).toBe("program-a");
    expect(saved[results[0].findIndex((cell) => cell === "Phase")]).toBe("PRE");

    const foreign = payload(code as unknown as ReturnType<typeof loadCode>, code.submit("bee", "other", "SCI-CS", answers, submissionId, "program-a", "PRE"));
    expect(foreign.error).toBe("not_in_program");
    expect(results.filter((row) => row.join(" ").includes(submissionId)).length).toBe(1);
    const otherProgram = payload(code as unknown as ReturnType<typeof loadCode>, code.submit("ada", "secret", "SCI-CS", answers, submissionId, "program-b", "SINGLE"));
    expect(otherProgram.error).toBe("not_in_program");

    const postStart = payload(code as unknown as ReturnType<typeof loadCode>, code.authAndLoad("ada", "secret", "SCI-CS", "program-a", "POST"));
    expect(postStart.ok).toBe(true);
    expect(postStart.submissionId).not.toBe(submissionId);
    const badChoice = payload(code as unknown as ReturnType<typeof loadCode>, code.submit("ada", "secret", "SCI-CS", { 1: "Z" }, postStart.submissionId, "program-a", "POST"));
    expect(badChoice.error).toBe("invalid_choice");
    expect((live.getSheetByName("Results")?.grid || []).filter((row) => row.join(" ").includes(String(postStart.submissionId))).length).toBe(0);

    const soil = payload(code as unknown as ReturnType<typeof loadCode>, code.authAndLoad("bee", "other", "SCI-SOIL", "program-b", "SINGLE"));
    expect(soil.error).toBe("not_released");
    const adaOnBeeProgram = payload(code as unknown as ReturnType<typeof loadCode>, code.authAndLoad("ada", "secret", "SCI-SOIL", "program-b", "SINGLE"));
    expect(adaOnBeeProgram.error).toBe("not_in_program");

    const resetA = payload(code as unknown as ReturnType<typeof loadCode>, code.commandPost_({
      accessToken: "editor-token",
      mutationId: "reset-a",
      command: "reset_cycle",
      programId: "program-a",
      username: "ada",
      testId: "SCI-CS",
      phase: "PRE",
      expectedCycle: 1,
    }));
    expect(resetA.ok).toBe(true);
    const state = live.getSheetByName("ProgramStudentState")?.grid || [];
    const pre = state.find((row) => row[0] === "program-a" && row[2] === "SCI-CS" && row[7] === "PRE");
    const post = state.find((row) => row[0] === "program-a" && row[2] === "SCI-CS" && row[7] === "POST");
    const soilState = state.find((row) => row[0] === "program-b");
    expect(pre?.[3]).toBe("2");
    expect(post?.[3]).toBe("1");
    expect(soilState?.[3]).toBe("1");
    expect(results.filter((row) => row[1] === "ada" && row.join(" ").includes("PRE")).length).toBe(1);

    const longAnswers: Record<string, string> = {};
    for (let i = 1; i <= 15; i++) longAnswers[String(i)] = i === 2 ? "B" : "A";
    const soilOpen = payload(code as unknown as ReturnType<typeof loadCode>, code.commandPost_({
      accessToken: "editor-token",
      mutationId: "open-soil",
      command: "save_release",
      programId: "program-b",
      testId: "SCI-SOIL",
      phase: "SINGLE",
      manual: "OPEN",
      openAt: "2099-01-01T00:00:00-10:00",
      closeAt: "",
      maxTries: 1,
      timeLimitSec: 0,
      expected: { manual: "AUTO", openAt: "2099-01-01T00:00:00-10:00", closeAt: "", maxTries: "1", timeLimitSec: "0" },
    }));
    expect(soilOpen.ok).toBe(true);
    const soilStart = payload(code as unknown as ReturnType<typeof loadCode>, code.authAndLoad("bee", "other", "SCI-SOIL", "program-b", "SINGLE"));
    expect(soilStart.ok).toBe(true);
    const soilSubmit = payload(code as unknown as ReturnType<typeof loadCode>, code.submit("bee", "other", "SCI-SOIL", longAnswers, soilStart.submissionId, "program-b", "SINGLE"));
    expect(soilSubmit.complete).toBe(true);
    const soilRow = (live.getSheetByName("Results")?.grid || []).find((row) => row.join(" ").includes(String(soilStart.submissionId)));
    expect(soilRow?.[4]).toBe("14/15");
    expect(JSON.parse(String(soilRow?.[jsonCol])).length).toBe(15);
    live.getSheetByName("ProgramStudents")!.appendRow(["program-b", "ada", "TRUE", "", ""]);
    const conflict = payload(code as unknown as ReturnType<typeof loadCode>, code.getTries("ada", "secret", "program-a"));
    expect(conflict.needProgram).toBe(true);
    expect(conflict.tests).toEqual([]);
    const direct = payload(code as unknown as ReturnType<typeof loadCode>, code.authAndLoad("ada", "secret", "SCI-CS", "program-a", "PRE"));
    expect(direct.error).toBe("need_program");

    const fractional = payload(code as unknown as ReturnType<typeof loadCode>, code.commandPost_({
      accessToken: "editor-token",
      mutationId: "fractional",
      command: "launch_program",
      program: { programId: "program-bad", programName: "Bad", status: "ACTIVE" },
      students: [{ username: "ada" }],
      tests: [{ testId: "SCI-CS", phase: "SINGLE", maxTries: 1.5, timeLimitSec: 0 }],
    }));
    expect(fractional.ok).toBe(false);
    const alias = payload(code as unknown as ReturnType<typeof loadCode>, code.commandPost_({
      accessToken: "editor-token",
      mutationId: "alias",
      command: "launch_program",
      program: { programId: "program-alias", programName: "Alias", status: "ACTIVE" },
      students: [{ username: "ada" }],
      tests: [
        { testId: "SCI-CS", phase: "SINGLE", maxTries: 1, timeLimitSec: 0 },
        { testId: "L3", phase: "SINGLE", maxTries: 1, timeLimitSec: 0 },
      ],
    }));
    expect(alias.ok).toBe(false);
    expect(live.getSheetByName("Programs")?.grid.some((row) => row[0] === "program-bad" || row[0] === "program-alias")).toBe(false);
    const draft = payload(code as unknown as ReturnType<typeof loadCode>, code.commandPost_({
      accessToken: "editor-token",
      mutationId: "draft-1",
      command: "launch_program",
      program: { programId: "program-draft", programName: "Draft", status: "DRAFT" },
      students: [{ username: "bee" }],
      tests: [{ testId: "SCI-HEALTH", phase: "SINGLE", maxTries: 1, timeLimitSec: 0 }],
    }));
    expect(draft.ok).toBe(true);
    const hidden = payload(code as unknown as ReturnType<typeof loadCode>, code.authAndLoad("bee", "other", "SCI-HEALTH", "program-draft", "SINGLE"));
    expect(hidden.error).toBe("not_in_program");
    const pinned = (live.getSheetByName("Attempts")?.grid || []).find((row) => row.join(" ").includes(submissionId));
    expect(pinned?.[5]).toBe("30");
  });

  it("records lesson support without using an attempt", () => {
    const live = book();
    live.getSheetByName("Programs")!.appendRow(["teach-cs", "Teach CS", "ACTIVE", "", "", "", "", "", ""]);
    live.getSheetByName("ProgramStudents")!.appendRow(["teach-cs", "ada", "TRUE", "", ""]);
    const links = live.insertSheet("ProgramLessons");
    links.appendRow(["ProgramId", "LessonId", "Enabled", "SortOrder", "LessonVersion", "OpenAt", "CloseAt", "UpdatedAtHST", "UpdatedBy", "RequirePre"]);
    links.appendRow(["teach-cs", "sci-cs@2026-10", "TRUE", "1", "2026-10", "", "", "", "editor", "YES"]);
    const code = loadCode(live) as unknown as {
      lessonProgressPost_: (body: unknown) => { getContent: () => string };
      judgeTeaching_: (lessonId: string, topicId: string, evidence: unknown) => { status: string };
      getTries: (username: string, password: string, programId: string) => { getContent: () => string };
      preSubmitted_: (ss: unknown, programId: string, username: string, testId: string) => boolean;
    };
    expect(code.judgeTeaching_("sci-cs@2026-10", "start", { ready: true }).status).toBe("met");
    expect(code.judgeTeaching_("sci-sust@2026-10", "start", { ready: true }).status).toBe("met");
    expect(code.judgeTeaching_("ment-interviews@2026-10", "start", { ready: true }).status).toBe("met");
    expect(code.judgeTeaching_("ment-interviews@2026-10", "impression", {
      sort: { contact: "do", complete: "do", clarify: "do", health: "skip", example: "do" },
      clothes: "For a lab internship I would wear a collared shirt and closed shoes.",
    }).status).toBe("met");
    expect(code.judgeTeaching_("ment-interviews@2026-10", "star", {
      situation: "In English class we worked in small groups.",
      task: "Each person had an assigned role.",
      action: "I suggested we each do what we were best at.",
      result: "The group worked together better than before.",
    }).status).toBe("invalid");
    expect(code.judgeTeaching_("ment-interviews@2026-10", "star", {
      situation: "Our science poster was due and nobody had started the chart.",
      task: "I was supposed to finish the chart before lunch.",
      action: "I split the chart into three parts and asked each person to finish one.",
      result: "We turned the poster in on time.",
    }).status).toBe("met");
    const interviewPage = readFileSync("lessons/ment-interviews/content.json", "utf8");
    expect(interviewPage).not.toContain("college classes");
    expect(interviewPage).not.toContain("All of the above");
    expect(interviewPage).not.toContain("unprofessional");
    expect(code.judgeTeaching_("ment-card-sort@2026-10", "start", { ready: true }).status).toBe("met");
    expect(code.judgeTeaching_("ment-card-sort@2026-10", "titles", {
      sort: {
        assistant: "high school diploma",
        technician: "associate or bachelor's degree",
        manager: "bachelor's or master's degree",
        professor: "doctorate",
      },
      role: "The konohiki manages land and water in an ahupuaa.",
    }).status).toBe("met");
    expect(code.judgeTeaching_("ment-card-sort@2026-10", "compare", {
      field: "Astronomy",
      modern: "A modern job is astronomer.",
      traditional: "A traditional role is kilo hoku.",
      change: "Both still watch the sky in the same way.",
    }).status).toBe("invalid");
    expect(code.judgeTeaching_("ment-card-sort@2026-10", "compare", {
      field: "Marine Science",
      modern: "A modern job is a marine biologist who studies reef fish.",
      traditional: "A traditional role is a kiaʻi who watches the same shoreline.",
      change: "The tools changed, but both still observe ocean life.",
    }).status).toBe("met");
    expect(code.judgeTeaching_("ment-card-sort@2026-10", "research", {
      title: "Marine biologist",
      education: "This job usually needs a bachelor's degree in marine science.",
      pay: "$55,000 to $80,000",
      skills: "You need careful observation and clear notes from the field.",
    }).status).toBe("met");
    const sortPage = readFileSync("lessons/ment-card-sort/content.json", "utf8");
    expect(code.judgeTeaching_("ment-scientist@2026-10", "start", { ready: true }).status).toBe("met");
    expect(code.judgeTeaching_("ment-scientist@2026-10", "work", {
      kind: "Chemistry",
      does: "They watch the lab.",
    }).status).toBe("invalid");
    expect(code.judgeTeaching_("ment-scientist@2026-10", "work", {
      kind: "Chemistry",
      does: "Scientists observe a pattern and collect data before they share it.",
    }).status).toBe("met");
    expect(code.judgeTeaching_("ment-scientist@2026-10", "admire", {
      who: "Dr. Jane Goodall",
      where: "Beyond Hawaiʻi",
      area: "Ethology",
      fact: "Dr. Jane Goodall observed chimpanzees at Gombe.",
    }).status).toBe("invalid");
    expect(code.judgeTeaching_("ment-scientist@2026-10", "admire", {
      who: "Dr. Cliff Kapono",
      where: "Hawaiʻi",
      area: "Chemistry",
      fact: "He is a chemist from Hilo who also tells stories through film.",
    }).status).toBe("met");
    expect(code.judgeTeaching_("ment-scientist@2026-10", "goals", {
      short: "By the end of the school year I will keep a weekly observation notebook.",
      long: "In college I want a degree that uses careful field observation.",
    }).status).toBe("met");
    const scientistPage = readFileSync("lessons/ment-scientist/content.json", "utf8");
    expect(scientistPage).not.toContain("All of the above");
    expect(scientistPage).not.toContain("Which of the following");
    expect(scientistPage).not.toContain("answer key");
    expect(sortPage).not.toContain("All of the above");
    expect(sortPage).not.toContain("typically requires a PhD");
    expect(sortPage).not.toContain("Which type of job typically requires");
    expect(sortPage).not.toContain("Lapa");
    expect(sortPage).not.toContain("wide variety of knowledge");
    expect(sortPage).not.toContain("PhD");
    const before = live.getSheetByName("Attempts")!.getLastRow();
    const blocked = JSON.parse(code.lessonProgressPost_({
      action: "lesson_progress",
      username: "ada",
      password: "secret",
      programId: "teach-cs",
      lessonId: "sci-cs@2026-10",
      topicId: "start",
      mode: "support",
    }).getContent());
    expect(blocked.error).toBe("pre_required");
    expect(live.getSheetByName("Attempts")!.getLastRow()).toBe(before);
    const results = live.getSheetByName("Results")!;
    results.grid[0][24] = "Phase";
    results.grid[0][25] = "ProgramId";
    const incomplete = new Array(26).fill("");
    incomplete[1] = "ada";
    incomplete[2] = "SCI-CS";
    incomplete[4] = "1/6";
    incomplete[23] = "NO";
    incomplete[24] = "PRE";
    incomplete[25] = "teach-cs";
    results.appendRow(incomplete);
    const exhausted = JSON.parse(code.lessonProgressPost_({
      action: "lesson_progress",
      username: "ada",
      password: "secret",
      programId: "teach-cs",
      lessonId: "sci-cs@2026-10",
      topicId: "start",
      mode: "support",
    }).getContent());
    expect(exhausted.error).toBe("pre_required");
    const unattributed = new Array(26).fill("");
    unattributed[1] = "ada";
    unattributed[2] = "SCI-CS";
    unattributed[4] = "6/6";
    unattributed[23] = "YES";
    unattributed[24] = "PRE";
    unattributed[25] = "";
    results.appendRow(unattributed);
    expect(code.preSubmitted_(live, "teach-cs", "ada", "SCI-CS")).toBe(false);
    expect(code.preSubmitted_(live, "hokulani", "ada", "SCI-CS")).toBe(true);
    const foreignProgram = JSON.parse(code.lessonProgressPost_({
      action: "lesson_progress",
      username: "ada",
      password: "secret",
      programId: "teach-cs",
      lessonId: "sci-cs@2026-10",
      topicId: "start",
      mode: "support",
    }).getContent());
    expect(foreignProgram.error).toBe("pre_required");
    const teachRow = results.grid.find((row) => row[25] === "teach-cs" && row[24] === "PRE");
    expect(teachRow).toBeTruthy();
    teachRow![23] = "YES";
    const opened = JSON.parse(code.lessonProgressPost_({
      action: "lesson_progress",
      username: "ada",
      password: "secret",
      programId: "teach-cs",
      lessonId: "sci-cs@2026-10",
      topicId: "start",
      mode: "support",
    }).getContent());
    expect(opened.ok).toBe(true);
    links.getRange(2, 10).setValue("NO");
    const saved = JSON.parse(code.lessonProgressPost_({
      action: "lesson_progress",
      username: "ada",
      password: "secret",
      programId: "teach-cs",
      lessonId: "sci-cs@2026-10",
      topicId: "start",
      mode: "support",
    }).getContent());
    expect(saved.ok).toBe(true);
    expect(saved.support).toBe(true);
    expect(live.getSheetByName("Attempts")!.getLastRow()).toBe(before);
    const progress = live.getSheetByName("LessonProgress")!.grid;
    expect(progress.some((row) => row[5] === "support" && row[7] === "YES")).toBe(true);
    const listed = JSON.parse(code.getTries("ada", "secret", "teach-cs").getContent());
    expect(listed.lessons[0].lessonId).toBe("sci-cs@2026-10");
    expect(listed.lessons[0].progress.done).toBe(1);
    expect(listed.lessons[0].pre.linked).toBe(true);
    expect(listed.tests).toEqual([]);
  });

  it("does not treat preview or a teaching row as a second cohort", () => {
    const live = book();
    live.getSheetByName("Programs")!.appendRow(["preview", "Preview", "ACTIVE", "", "", "", "", "", ""]);
    live.getSheetByName("Programs")!.appendRow(["teach-cs", "Teaching Computer Science", "ACTIVE", "", "", "", "", "", ""]);
    live.getSheetByName("Programs")!.appendRow(["spring", "Spring Interns", "ACTIVE", "", "", "", "", "", ""]);
    live.getSheetByName("ProgramStudents")!.appendRow(["preview", "ada", "TRUE", "", ""]);
    live.getSheetByName("ProgramStudents")!.appendRow(["teach-cs", "ada", "TRUE", "", ""]);
    const code = loadCode(live) as unknown as {
      getTries: (username: string, password: string, programId: string) => { getContent: () => string };
    };
    const slices = payload(code as unknown as ReturnType<typeof loadCode>, code.getTries("ada", "secret", ""));
    expect(slices.needProgram).toBe(true);
    expect(slices.programs).toEqual(["preview", "teach-cs"]);
    const science = payload(code as unknown as ReturnType<typeof loadCode>, code.getTries("ada", "secret", "teach-cs"));
    expect(science.programId).toBe("teach-cs");
    expect(science.needProgram).toBeUndefined();
    live.getSheetByName("ProgramStudents")!.appendRow(["spring", "ada", "TRUE", "", ""]);
    live.getSheetByName("ProgramStudents")!.appendRow(["summer", "ada", "TRUE", "", ""]);
    live.getSheetByName("Programs")!.appendRow(["summer", "Summer 1", "ACTIVE", "", "", "", "", "", ""]);
    const twoCohorts = payload(code as unknown as ReturnType<typeof loadCode>, code.getTries("ada", "secret", "spring"));
    expect(twoCohorts.needProgram).toBe(true);
    expect(twoCohorts.programId).toBeUndefined();
  });
});
