import { TEST_TITLES } from "../ids";
import { phaseOf } from "../programs/ids";
import { bestCompleteScores, formatScore } from "../reports/best-scores";
import { lessonRecords, lessonWorkText, type LessonRecord } from "../reports/lesson-status";
import { PUBLISHED_LESSONS, type PublishedLesson } from "../teaching";
import type { DashboardSnapshot } from "../types";
import { infoDialog } from "./dialogs";
import { el } from "./dom";
import { pageHeading } from "./help";

let lessonScope = "";

const DONE = new Set(["met", "support"]);

function packFor(lessonId: string): PublishedLesson | undefined {
  return PUBLISHED_LESSONS.find((pack) => pack.lessonId === lessonId);
}

function topicProgress(record: LessonRecord): { done: number; total: number } {
  const pack = packFor(record.lessonId);
  const done = record.work.filter((topic) => DONE.has(topic.status)).length;
  return { done, total: pack?.topicCount || Math.max(record.work.length, done) };
}

function linkedTest(snap: DashboardSnapshot, programId: string, record: LessonRecord, phase: "PRE" | "POST") {
  const pack = packFor(record.lessonId);
  if (!pack?.linked || !pack.assessmentId) return null;
  return snap.programTests.find(
    (test) =>
      test.programId === programId &&
      test.enabled &&
      test.testId === pack.assessmentId &&
      phaseOf(test.phase) === phase,
  );
}

function phaseScore(
  snap: DashboardSnapshot,
  programId: string,
  record: LessonRecord,
  phase: "PRE" | "POST",
  scores: ReturnType<typeof bestCompleteScores>,
): string {
  const pack = packFor(record.lessonId);
  if (!pack?.linked || !pack.assessmentId) return "Not assigned";
  const release = linkedTest(snap, programId, record, phase);
  const score = scores.find(
    (row) => row.username === record.username && row.testId === pack.assessmentId && phaseOf(row.phase) === phase,
  );
  if (score) return formatScore(score.scoreNum, score.scoreDen);
  if (!release) return "Not assigned";
  if (release.state === "scheduled") return "Scheduled";
  if (release.state === "hidden") return "Not yet eligible";
  return "Missing";
}

function obligationOutstanding(record: LessonRecord): boolean {
  const pack = packFor(record.lessonId);
  if (!pack?.linked) return false;
  return record.assessment !== "PRE and POST recorded";
}

function followUp(record: LessonRecord): { text: string; warn: boolean } {
  const supported = record.work.filter((topic) => topic.support);
  if (record.support || supported.length) {
    const names = supported.map((topic) => topic.topicId).filter(Boolean);
    return { text: names.length ? `Needs support · ${names.join(", ")}` : "Needs support", warn: true };
  }
  if (record.progress === "Not started") return { text: "Has not started", warn: false };
  const pack = packFor(record.lessonId);
  if (!pack?.linked) return { text: record.progress === "Lesson completed" ? "Assessment unlinked" : "Assessment unlinked", warn: true };
  if (record.assessment === "POST missing") return { text: "POST outstanding", warn: false };
  if (record.assessment === "PRE missing") return { text: "PRE outstanding", warn: false };
  if (record.assessment === "Assessment missing") return { text: "Assessment missing", warn: false };
  if (record.progress === "In progress") return { text: "In progress", warn: false };
  return { text: "—", warn: false };
}

function singleSitting(
  record: LessonRecord,
  scores: ReturnType<typeof bestCompleteScores>,
): string {
  const pack = packFor(record.lessonId);
  if (!pack?.assessmentId) return "";
  const row = scores.find(
    (score) => score.username === record.username && score.testId === pack.assessmentId && phaseOf(score.phase) === "SINGLE",
  );
  return row ? `Earlier single sitting ${formatScore(row.scoreNum, row.scoreDen)}` : "";
}

export function renderOverview(
  main: HTMLElement,
  snap: DashboardSnapshot,
  programId: string,
  onMissing: () => void,
  onHealth: () => void,
  onRescope: () => void,
): void {
  const program = snap.programs.find((item) => item.programId === programId);
  const records = lessonRecords({
    programId,
    students: snap.programStudents,
    lessons: snap.programLessons,
    progress: snap.lessonProgress,
    results: snap.results,
    packs: PUBLISHED_LESSONS,
  });
  const lessonIds = [...new Set(records.map((record) => record.lessonId))];
  if (lessonScope && !lessonIds.includes(lessonScope) && lessonScope !== "__all__") lessonScope = "";
  if (!lessonScope) lessonScope = lessonIds[0] || "";
  const scopeId = lessonIds.length > 1 ? lessonScope || lessonIds[0] || "" : lessonIds[0] || "";
  const scoped = !scopeId || scopeId === "__all__" ? records : records.filter((record) => record.lessonId === scopeId);
  const scopePack = scopeId && scopeId !== "__all__" ? packFor(scopeId) : undefined;
  const scopeName = scopePack?.title || (scopeId === "__all__" ? "All enabled lessons" : "This lesson");
  const submitted = scoped.filter((record) => record.progress === "Lesson completed").length;
  const missingStudents = new Set(scoped.filter(obligationOutstanding).map((record) => record.username)).size;
  const supportRows = scoped.filter((record) => record.support);
  const scores = bestCompleteScores(snap.results, snap.questionCounts);

  main.append(el("div", { class: "kicker" }, (program?.programName || programId || "Program").toUpperCase()));
  pageHeading(main, "Program overview", "overview");
  const lead = el("p", { class: "muted" });
  lead.textContent = scopePack
    ? `Counts below are ${scopePack.title} only. They are not completion for the whole program.`
    : "Counts below cover every enabled teaching lesson. They are not a single program-completion score.";
  main.append(lead);

  if (lessonIds.length > 1) {
    const label = el("label", { class: "scope-label" }, "Lesson");
    const select = el("select", { id: "overview-lesson", "aria-label": "Lesson shown in this overview" }) as HTMLSelectElement;
    for (const id of lessonIds) {
      const pack = packFor(id);
      select.append(new Option(pack?.title || id, id));
    }
    select.append(new Option("All enabled lessons", "__all__"));
    select.value = scopeId || "__all__";
    select.onchange = () => {
      lessonScope = select.value;
      onRescope();
    };
    label.append(select);
    main.append(label);
  }

  const stats = el("div", { class: "stats" });
  const stat = (label: string, value: string, note: string) => {
    const cell = el("div", { class: "stat" });
    cell.append(el("span", {}, label), el("strong", {}, value), el("span", {}, note));
    stats.append(cell);
  };
  stat("Students in program", String(snap.students.length), "Program roster");
  stat(
    scopePack ? `${scopePack.title} lessons submitted` : "Lesson rows submitted",
    `${submitted} / ${scoped.length}`,
    scopePack ? "Topics met or supported" : "Across enabled lessons",
  );
  stat("Missing assessments", `${missingStudents} ${missingStudents === 1 ? "student" : "students"}`, "PRE or POST outstanding");
  stat("Open support needs", String(supportRows.length), supportRows.length ? "Continued with help" : "No support flag");
  main.append(stats);

  const titleRow = el("div", { class: "section-title" });
  titleRow.append(el("h2", {}, "Student progress"));
  const follow = el("button", { type: "button" }, "Prepare follow-up");
  follow.onclick = onMissing;
  titleRow.append(follow);
  main.append(titleRow);
  if (scopePack) main.append(el("p", { class: "muted" }, `${scopeName} · one row per enrolled student`));

  const wrap = el("div", { class: "table-wrap" });
  const table = el("table");
  const head = el("tr");
  ["Student", "Lesson topics", "PRE score", "POST score", "Follow-up", ""].forEach((label) => head.append(el("th", {}, label)));
  table.append(head);
  if (!scoped.length) {
    const empty = el("tr");
    empty.append(el("td", { colspan: "6" }, "No enabled teaching lessons for the students in this program."));
    table.append(empty);
  }
  scoped.forEach((record, index) => {
    const progress = topicProgress(record);
    const note = followUp(record);
    const tr = el("tr");
    const who = el("td");
    who.append(el("strong", {}, record.username));
    if (scopeId === "__all__") who.append(el("span", { class: "cellnote" }, record.title));
    const topics = el("td");
    topics.append(document.createTextNode(`${progress.done} / ${progress.total}`));
    if (record.support) topics.append(el("span", { class: "cellnote" }, "Completed with support"));
    const followCell = el("td");
    if (note.warn) followCell.append(el("span", { class: "tag warn" }, note.text));
    else followCell.append(document.createTextNode(note.text));
    const view = el("button", { type: "button", id: `overview-view-${index}` }, "View");
    view.onclick = () => {
      const pre = phaseScore(snap, programId, record, "PRE", scores);
      const post = phaseScore(snap, programId, record, "POST", scores);
      const earlier = singleSitting(record, scores);
      const pack = packFor(record.lessonId);
      const knownTitle = pack?.assessmentId && Object.prototype.hasOwnProperty.call(TEST_TITLES, pack.assessmentId)
        ? TEST_TITLES[pack.assessmentId as keyof typeof TEST_TITLES]
        : record.title;
      const body = [
        `${record.title}`,
        `${progress.done} of ${progress.total} topics · ${record.progress}`,
        record.support ? "At least one topic continued with support. That is help, not an official test attempt." : "No support flag on the saved topics.",
        `PRE: ${pre}`,
        `POST: ${post}`,
        earlier,
        pack?.linked ? `Assessment: ${knownTitle}` : "No official assessment is linked. SCI-CORAL stays the 3D printing bank.",
        "",
        lessonWorkText(record),
      ].filter((line) => line !== "").join("\n");
      infoDialog(`${record.username} · ${record.title}`, body);
    };
    const action = el("td");
    action.append(view);
    tr.append(who, topics, el("td", {}, phaseScore(snap, programId, record, "PRE", scores)), el("td", {}, phaseScore(snap, programId, record, "POST", scores)), followCell, action);
    table.append(tr);
  });
  wrap.append(table);
  main.append(wrap);

  const needs = scoped.filter((record) => {
    const note = followUp(record);
    return note.text !== "—" && note.text !== "In progress";
  });
  if (needs.length) {
    const callout = el("div", { class: "callout" });
    const copy = el("div");
    copy.append(el("strong", {}, "Ready for follow-up"));
    const sample = needs.slice(0, 3).map((record) => `${record.username}: ${followUp(record).text} (${record.title})`);
    const more = needs.length > 3 ? ` ${needs.length - 3} more are on Missing work.` : "";
    copy.append(el("p", {}, `${sample.join(" ")}.${more} The draft is editable and is not sent from here.`));
    const review = el("button", { type: "button" }, "Review missing work");
    review.onclick = onMissing;
    callout.append(copy, review);
    main.append(callout);
  }

  if (snap.issues.length) {
    const health = el("button", { type: "button", class: "linkish" }, `Parse warnings: ${snap.issues.length}`);
    health.onclick = onHealth;
    main.append(health);
  }
  main.append(el("p", { class: "muted" }, `Results parse mode: ${snap.resultsHeaderMode}`));
}
