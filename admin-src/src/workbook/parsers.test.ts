import { describe, expect, it } from "vitest";
import { observedWorkbook } from "../fixtures/observed";
import { buildSnapshot } from "./snapshot";
import { parseResults } from "./results";
import { parseStudents } from "./students";
import { evaluateRelease } from "./releases";
import { toCsv } from "../csv";
import { rowMatchesQuery } from "../ui/shell";
import { canonicalTestId } from "../ids";

describe("ids", () => {
  it("maps L3 and SCI-CS to one assessment", () => {
    expect(canonicalTestId("L3")).toBe("SCI-CS");
    expect(canonicalTestId("sci-cs")).toBe("SCI-CS");
  });
});

describe("students", () => {
  it("skips blank initialized rows and reports duplicates", () => {
    const wb = observedWorkbook();
    const parsed = parseStudents(wb.students);
    expect(parsed.students.length).toBe(6);
    expect(parsed.skippedBlank).toBeGreaterThanOrEqual(8);
    expect(parsed.issues.some((i) => i.id.startsWith("students-blank-user"))).toBe(false);
    expect(parsed.issues.some((i) => i.message.includes("Duplicate"))).toBe(true);
    expect(JSON.stringify(parsed.students).toLowerCase()).not.toContain("password");
  });
});

describe("results", () => {
  it("treats row 1 as data when labels sit in T–X", () => {
    const wb = observedWorkbook();
    const parsed = parseResults(wb.results);
    expect(parsed.headerMode).toBe("positional");
    expect(parsed.results[0]?.username).toBe("student.one@example.edu");
    expect(parsed.results[0]?.complete).toBe(true);
    expect(parsed.results[0]?.scoreNum).toBe(4);
    expect(parsed.results[0]?.scoreDen).toBe(5);
  });

  it("parses a real header row", () => {
    const parsed = parseResults([
      ["Timestamp", "Username", "TestId", "Cycle", "LifetimeSeq", "Score", "Q1", "Q2", "Q3", "Q4", "Q5", "SubmissionId", "Status"],
      ["2026-09-01", "ada@example.edu", "SCI-SOIL", 1, 1, "5/5", "A", "B", "C", "D", "A", "sub-1", "done"],
    ]);
    expect(parsed.headerMode).toBe("header");
    expect(parsed.results[0]?.complete).toBe(true);
    expect(parsed.results[0]?.submissionId).toBe("sub-1");
  });

  it("marks incomplete when an answer is blank", () => {
    const parsed = parseResults([
      ["2026-09-10T09:00:00-10:00", "bob@example.edu", "L2", 1, "2/5", "A", "B", "", "", ""],
    ]);
    expect(parsed.results[0]?.complete).toBe(false);
  });
});

describe("snapshot", () => {
  it("builds reports without leaking hashes or keys", () => {
    const snap = buildSnapshot(observedWorkbook(), new Date("2026-09-16T12:00:00-10:00"));
    expect(snap.resultsHeaderMode).toBe("positional");
    const soilBest = snap.bestScores.find((b) => b.username.startsWith("student.one") && b.testId === "SCI-SOIL");
    expect(soilBest?.scoreNum).toBe(5);
    expect(soilBest?.completeCount).toBe(2);
    const incompleteCoral = snap.results.find((r) => r.username.startsWith("student.two") && r.scoreNum === 2);
    expect(incompleteCoral?.complete).toBe(false);
    expect(snap.bestScores.some((b) => b.username.startsWith("student.two") && b.testId === "SCI-CORAL" && b.scoreNum === 5)).toBe(true);
    expect(JSON.stringify(snap).toLowerCase()).not.toContain('"passwordhash"');
    expect(JSON.stringify(snap).toLowerCase()).not.toContain("correctsnapshot");
    expect(snap.issues.some((i) => i.message.includes("no matching attempt"))).toBe(true);
    expect(snap.issues.some((i) => i.message.includes("Unknown assessment"))).toBe(true);
  });
});

describe("releases", () => {
  it("treats UNSET as open and AUTO without OpenAt as hidden", () => {
    const now = new Date("2026-09-16T12:00:00-10:00");
    expect(evaluateRelease({ manual: "UNSET", openAt: "", closeAt: "" }, now).state).toBe("open");
    expect(evaluateRelease({ manual: "AUTO", openAt: "", closeAt: "" }, now).state).toBe("hidden");
    expect(evaluateRelease({ manual: "CLOSED", openAt: "", closeAt: "" }, now).state).toBe("closed");
  });
});

describe("search filter", () => {
  it("matches without requiring a full string", () => {
    expect(rowMatchesQuery(["student.one@example.edu"], "s")).toBe(true);
    expect(rowMatchesQuery(["student.one@example.edu"], "st")).toBe(true);
    expect(rowMatchesQuery(["student.one@example.edu"], "zzz")).toBe(false);
    expect(rowMatchesQuery(["student.one@example.edu"], "")).toBe(true);
  });
});

describe("csv", () => {
  it("escapes quotes and commas", () => {
    expect(toCsv(["a", "b"], [["x,y", 'he said "hi"']])).toBe('a,b\n"x,y","he said ""hi"""');
  });
});

describe("html injection", () => {
  it("keeps script text as data not markup", () => {
    const parsed = parseStudents([
      ["Username", "PasswordHash"],
      ["<script>alert(1)</script>", "nope"],
    ]);
    expect(parsed.students[0]?.username).toContain("<script>");
  });
});
