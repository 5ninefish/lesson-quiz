import { describe, expect, it } from "vitest";
import { observedWorkbook } from "../fixtures/observed";
import { missingTestsForProgram } from "../missing/calculate";
import { emailContainsForbiddenDate, missingEmailBody, missingEmailSubject, REQUIRED_SENTENCE } from "../missing/email-template";
import { buildSnapshot } from "../workbook/snapshot";
import { isValidProgramId, minutesToSeconds, normalizeProgramId, suggestProgramId } from "./ids";
import { buildLaunchPlan, defaultDraft, verifyLaunch } from "./launcher";
import { resolveStudentProgram } from "./memberships";
import { releaseMutation, verifyCells } from "./mutations";
import { studentProgramUrl, studentTestUrl, urlHasNoStudentData } from "./urls";
import { seedHokulaniPlan } from "./seed";
import { planAssignmentUpdate } from "./assignment-save";
import { planCycleReset } from "./reset";
import { formatHst, uniqueProgramId } from "./ids";
import { buildStudentRows, pageOf, parseRosterPaste } from "./roster-import";
import { attemptInProgram } from "./summaries";

const now = new Date("2026-09-16T12:00:00-10:00");

describe("program ids", () => {
  it("normalizes and validates slugs", () => {
    expect(normalizeProgramId(" Summer-2026 ")).toBe("summer-2026");
    expect(isValidProgramId("hokulani")).toBe(true);
    expect(isValidProgramId("summer-2026")).toBe(true);
    expect(isValidProgramId("Summer")).toBe(true);
    expect(isValidProgramId("bad_id")).toBe(false);
    expect(isValidProgramId("Summer 2026")).toBe(false);
    expect(suggestProgramId("Hōkūlani Fall 2026")).toBe("hokulani-fall-2026");
  });
});

describe("membership resolution", () => {
  const programs = [
    { programId: "hokulani", programName: "Hōkūlani", status: "ACTIVE" as const, startAt: "", endAt: "", createdAtHst: "", createdBy: "", updatedAtHst: "", updatedBy: "", rowNumber: 2 },
    { programId: "summer-2026", programName: "Summer", status: "ACTIVE" as const, startAt: "", endAt: "", createdAtHst: "", createdBy: "", updatedAtHst: "", updatedBy: "", rowNumber: 3 },
  ];
  const memberships = [
    { programId: "hokulani", username: "ada@example.edu", active: true, assignedAtHst: "", assignedBy: "", rowNumber: 2 },
    { programId: "summer-2026", username: "ada@example.edu", active: true, assignedAtHst: "", assignedBy: "", rowNumber: 3 },
    { programId: "hokulani", username: "only@example.edu", active: true, assignedAtHst: "", assignedBy: "", rowNumber: 4 },
  ];

  it("auto-selects a single membership", () => {
    expect(resolveStudentProgram({ tablesPresent: true, memberships, programs, username: "only@example.edu", requested: "" })).toEqual({
      kind: "auto",
      programId: "hokulani",
    });
  });

  it("returns a picker for multiple memberships", () => {
    const r = resolveStudentProgram({ tablesPresent: true, memberships, programs, username: "ada@example.edu", requested: "" });
    expect(r.kind).toBe("picker");
  });

  it("rejects a requested program without membership", () => {
    const r = resolveStudentProgram({
      tablesPresent: true,
      memberships,
      programs,
      username: "only@example.edu",
      requested: "summer-2026",
    });
    expect(r.kind).toBe("mismatch");
  });

  it("uses legacy mode when program tables are absent", () => {
    expect(resolveStudentProgram({ tablesPresent: false, memberships: [], programs: [], username: "ada@example.edu", requested: "" }).kind).toBe("legacy");
  });
});

describe("program-aware missing tests", () => {
  it("does not treat another program's complete result as done", () => {
    const snap = buildSnapshot(observedWorkbook(), now);
    const hok = missingTestsForProgram({
      programId: "hokulani",
      memberships: snap.programStudents,
      tests: snap.programTests,
      results: snap.results,
    });
    const summer = missingTestsForProgram({
      programId: "summer-2026",
      memberships: snap.programStudents,
      tests: snap.programTests,
      results: snap.results,
    });
    const oneHok = hok.find((r) => r.username === "student.one@example.edu");
    const oneSummer = summer.find((r) => r.username === "student.one@example.edu");
    expect(oneHok?.missing.includes("SCI-SOIL")).toBe(false);
    expect(oneSummer?.missing.includes("SCI-SOIL")).toBe(true);
    expect(summer.every((r) => r.missing.every((id) => id === "SCI-SOIL" || id === "SCI-CORAL"))).toBe(true);
  });

  it("attributes unmatched results as legacy hokulani without rewriting them", () => {
    const snap = buildSnapshot(observedWorkbook(), now);
    expect(snap.legacyAttributedResults).toBeGreaterThan(0);
    expect(snap.results.every((r) => r.source === "positional" || r.source === "headered")).toBe(true);
  });
});

describe("urls and email", () => {
  it("builds direct test urls without student data", () => {
    const url = studentTestUrl("summer-2026", "SCI-SOIL");
    expect(url).toContain("program=summer-2026");
    expect(url).toContain("test=SCI-SOIL");
    expect(urlHasNoStudentData(url)).toBe(true);
    expect(studentProgramUrl("hokulani")).toContain("program=hokulani");
  });

  it("uses the required no-date sentence", () => {
    const body = missingEmailBody({
      username: "ada@example.edu",
      programId: "hokulani",
      programName: "Hōkūlani",
      missing: ["SCI-SOIL", "SCI-CS"],
    });
    expect(body).toContain(REQUIRED_SENTENCE);
    expect(emailContainsForbiddenDate(body)).toBe(false);
    expect(missingEmailSubject("Hōkūlani")).toBe("[Hōkūlani] — missing post-tests");
  });
});

describe("launch plan and mutations", () => {
  it("blocks invalid slugs and empty selections", () => {
    const snap = buildSnapshot(observedWorkbook(), now);
    const draft = defaultDraft("");
    const plan = buildLaunchPlan({
      draft,
      existingProgramIds: snap.programs.map((p) => p.programId),
      students: snap.students,
      questions: snap.questions,
    });
    expect(plan.blocking.length).toBeGreaterThan(0);
  });

  it("converts timer minutes to seconds and verifies launch counts", () => {
    expect(minutesToSeconds(30)).toBe(1800);
    const snap = buildSnapshot(observedWorkbook(), now);
    const draft = defaultDraft("Kapilina Fall 2026");
    draft.programId = "kapilina-fall-2026";
    draft.usernames = ["student.one@example.edu"];
    draft.tests = [{ testId: "SCI-SOIL", sortOrder: 1, manual: "UNSET", openAt: "", closeAt: "", maxTries: 2, timeLimitMinutes: 30 }];
    draft.nowHst = "2026-09-16T12:00:00-10:00";
    draft.actor = "demo";
    const plan = buildLaunchPlan({
      draft,
      existingProgramIds: snap.programs.map((p) => p.programId),
      students: snap.students,
      questions: snap.questions,
    });
    expect(plan.blocking).toEqual([]);
    expect(plan.tests[0]?.timeLimitSec).toBe(1800);
    expect(plan.state).toHaveLength(1);
    expect(verifyLaunch(plan, { programs: [plan.program], students: plan.students, tests: plan.tests, state: plan.state })).toEqual([]);
    expect(verifyLaunch(plan, { programs: [], students: [], tests: [], state: [] }).length).toBeGreaterThan(0);
  });

  it("detects a stale release preview", () => {
    const snap = buildSnapshot(observedWorkbook(), now);
    const current = snap.programTests.find((t) => t.programId === "hokulani" && t.testId === "SCI-SOIL")!;
    const planned = releaseMutation({ current, action: "close", actor: "demo", nowHst: "now" });
    expect(planned.next.manual).toBe("CLOSED");
    expect(planned.staleIf({ ...current, manual: "OPEN" })).toBe(true);
    expect(verifyCells(planned.preview.after, planned.preview.after)).toEqual([]);
    expect(verifyCells(["a"], ["b"]).length).toBe(1);
  });
});

describe("hokulani seed", () => {
  it("creates one state row per student/test pair", () => {
    const snap = buildSnapshot(observedWorkbook(), now);
    const unique = new Set(snap.students.map((s) => s.username));
    const { report } = seedHokulaniPlan({
      students: snap.students.filter((s, i, arr) => arr.findIndex((x) => x.username === s.username) === i),
      releases: snap.releases,
      actor: "demo",
      nowHst: "now",
    });
    expect(report.stateRows).toBe(unique.size * snap.releases.length);
    expect(report.blocking).toEqual([]);
  });
});

describe("assignment state pairs", () => {
  const draft = {
    ...defaultDraft("Summer"),
    programId: "summer-2026",
    programName: "Summer",
    usernames: ["ada", "bea"],
    tests: [
      { testId: "SCI-CS" as const, sortOrder: 1, manual: "UNSET" as const, openAt: "", closeAt: "", maxTries: 2, timeLimitMinutes: 0 },
      { testId: "SCI-SOIL" as const, sortOrder: 2, manual: "CLOSED" as const, openAt: "", closeAt: "", maxTries: 1, timeLimitMinutes: 5 },
    ],
    actor: "instructor",
    nowHst: "now",
  };

  it("creates a state row for every new student and test pair and leaves an existing pair alone", () => {
    const update = planAssignmentUpdate({
      programId: "summer-2026",
      draft,
      memberships: [],
      programTests: [],
      state: [
        {
          programId: "summer-2026",
          username: "ada",
          testId: "SCI-CS",
          cycle: 3,
          sitCache: 1,
          updatedAtHst: "",
          updatedBy: "",
          rowNumber: 4,
        },
      ],
    });
    const state = update.appends.find((block) => block.tab === "ProgramStudentState");
    expect(state?.values).toHaveLength(3);
    expect(state?.values.some((row) => row[1] === "ada" && row[2] === "SCI-CS")).toBe(false);
    expect(update.addedState).toBe(3);
  });
});

describe("program reset isolation", () => {
  it("bumps only the selected program and test", () => {
    const plan = planCycleReset({
      programId: "summer-2026",
      username: "ada",
      testId: "SCI-CS",
      state: [
        { programId: "summer-2026", username: "ada", testId: "SCI-CS", cycle: 1, sitCache: 2, updatedAtHst: "", updatedBy: "", rowNumber: 8 },
        { programId: "hokulani", username: "ada", testId: "SCI-CS", cycle: 4, sitCache: 1, updatedAtHst: "", updatedBy: "", rowNumber: 9 },
      ],
      enabledTestIds: ["SCI-CS", "SCI-SOIL"],
      attempts: [],
      actor: "instructor",
      nowHst: "now",
    });
    expect(plan.blocking).toEqual([]);
    expect(plan.updates).toEqual([
      { range: "ProgramStudentState!D8:G8", values: [["2", "0", "now", "instructor"]] },
    ]);
    expect(JSON.stringify(plan)).not.toContain("D9");
  });

  it("does not treat another program's attempt as the one to resolve", () => {
    expect(attemptInProgram({
      username: "ada",
      testId: "SCI-CS",
      cycle: 1,
      submissionId: "s",
      startedAt: "",
      timeLimitSec: 30,
      status: "in_flight",
      displayStatus: "in_flight",
      deadlineAt: null,
      remainingSec: null,
      rowNumber: 3,
      rawTestId: "SCI-CS",
      programId: "hokulani",
    }, "summer-2026")).toBe(false);
  });
});

describe("roster import", () => {
  it("previews accepted, duplicate, and rejected rows without returning passwords in the duplicate list", () => {
    const preview = parseRosterPaste("username,email,password\nada,ada@example.edu,secret\nada,ada@example.edu,secret\n,bad@example.edu,secret\nbea,not-an-email,secret\n", ["ada"]);
    expect(preview.accepted).toEqual([]);
    expect(preview.duplicates.map((row) => row.username)).toEqual(["ada", "ada"]);
    expect(preview.rejected.length).toBe(2);
    expect(JSON.stringify(preview.duplicates)).not.toContain("secret");
  });

  it("places a new student on the named Password column", () => {
    const built = buildStudentRows(
      ["Username", "Email", "Password", "L1", "CycleL1"],
      [{ username: "cy", email: "cy@example.edu", password: "kept-plain" }],
    );
    expect(built.blocking).toEqual([]);
    expect(built.values[0]).toEqual(["cy", "cy@example.edu", "kept-plain", "0", "1"]);
  });

  it("pages the roster", () => {
    const paged = pageOf(["a", "b", "c"], 2, 2);
    expect(paged).toEqual({ page: 2, pages: 2, rows: ["c"] });
  });
});

describe("schedule display", () => {
  it("labels a parseable instant in HST", () => {
    expect(formatHst("2026-09-20T19:00:00Z")).toContain("HST");
    expect(formatHst("")).toBe("—");
  });

  it("does not reuse an archived program id for a duplicate", () => {
    expect(uniqueProgramId("hokulani", ["hokulani", "hokulani-copy"])).toBe("hokulani-copy-2");
  });
});
