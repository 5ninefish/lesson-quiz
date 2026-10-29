import type { DashboardSnapshot } from "../types";
import { PUBLISHED_LESSONS } from "../teaching";
import { lessonRecords, lessonWorkText } from "../reports/lesson-status";
import { el } from "./dom";
import { infoDialog } from "./dialogs";
import { pageHeading } from "./help";

export type LessonDraft = {
  lessonId: string;
  enabled: boolean;
  sortOrder: number;
  openAt: string;
  closeAt: string;
  requirePre: boolean;
};

export function renderLessons(
  main: HTMLElement,
  snap: DashboardSnapshot,
  programId: string,
  writeEnabled: boolean,
  onSave: (programId: string, lessons: LessonDraft[]) => void,
  onRegister: () => void,
): void {
  pageHeading(main, "Lessons & tests", "lessons");
  const program = snap.programs.find((item) => item.programId === programId);
  main.append(el("p", { class: "muted" }, "Lesson enablement is separate from assessment release. Practice and support do not use a PRE or POST attempt."));
  main.append(el("p", {}, program ? `${program.programName} (${program.programId})` : "Choose a program in the top menu."));
  const register = el("button", { type: "button", id: "btn-register-lessons" }, "Register published lessons");
  register.disabled = !writeEnabled;
  register.onclick = () => onRegister();
  main.append(register);
  if (!program) return;

  const saved = new Map(snap.programLessons.filter((row) => row.programId === programId).map((row) => [row.lessonId, row]));
  const catalog = new Map(snap.lessonCatalog.map((row) => [row.lessonId, row]));
  const form = el("div", { id: "lesson-editor" });
  PUBLISHED_LESSONS.forEach((pack, index) => {
    const row = saved.get(pack.lessonId);
    const recorded = catalog.get(pack.lessonId);
    const card = el("section", { class: "program-card" });
    card.append(el("h2", {}, pack.title));
    const status = recorded ? recorded.status : "not registered";
    const link = pack.linked ? `PRE and POST use ${pack.assessmentId}.` : "No official assessment is linked. SCI-CORAL stays the 3D printing bank.";
    card.append(el("p", { class: "muted" }, `${pack.lessonId} · version ${pack.version} · catalog ${status}. ${link}`));
    const enable = el("input", { type: "checkbox", id: `lesson-on-${pack.slug}` }) as HTMLInputElement;
    enable.checked = !!row?.enabled;
    const enableLabel = el("label", {}, "Enabled ");
    enableLabel.append(enable);
    const sort = el("input", { type: "number", id: `lesson-sort-${pack.slug}`, value: String(row?.sortOrder || index + 1) }) as HTMLInputElement;
    sort.style.width = "5rem";
    const open = el("input", { type: "text", id: `lesson-open-${pack.slug}`, value: row?.openAt || "", placeholder: "Open at (empty means available)" }) as HTMLInputElement;
    const close = el("input", { type: "text", id: `lesson-close-${pack.slug}`, value: row?.closeAt || "", placeholder: "Close at" }) as HTMLInputElement;
    const require = el("input", { type: "checkbox", id: `lesson-pre-${pack.slug}` }) as HTMLInputElement;
    require.checked = !!row?.requirePre;
    require.disabled = !pack.linked;
    const requireLabel = el("label", {}, "Require a submitted PRE before activities ");
    requireLabel.append(require);
    card.append(enableLabel, el("label", {}, "Order "), sort, open, close, requireLabel);
    form.append(card);
  });
  const save = el("button", { type: "button", class: "primary", id: "btn-save-lessons" }, "Save lessons");
  save.disabled = !writeEnabled;
  save.onclick = () => onSave(programId, readLessonDrafts());
  form.append(save);
  main.append(form);

  const records = lessonRecords({
    programId,
    students: snap.programStudents,
    lessons: snap.programLessons,
    progress: snap.lessonProgress,
    results: snap.results,
    packs: PUBLISHED_LESSONS,
  });
  main.append(el("h2", {}, "Lesson records"));
  main.append(el("p", { class: "muted" }, "One row for each enrolled student and enabled lesson. View work opens the saved answers. Support is help, not an official test attempt."));
  const summaryHead = el("tr");
  ["Student", "Lesson", "Progress", "Assessment", "Support", "Work"].forEach((label) => summaryHead.append(el("th", {}, label)));
  const summary = el("table", { id: "lesson-records" });
  summary.append(summaryHead);
  if (!records.length) {
    const empty = el("tr");
    empty.append(el("td", { colspan: "6" }, "No enabled lessons for the students in this program."));
    summary.append(empty);
  }
  records.forEach((record, index) => {
    const tr = el("tr");
    [record.username, record.title, record.progress, record.assessment, record.support].forEach((value) => tr.append(el("td", {}, value)));
    const work = el("button", { type: "button", id: `lesson-work-${index}` }, "View work");
    work.onclick = () => infoDialog(`${record.username} · ${record.title}`, lessonWorkText(record));
    const cell = el("td");
    cell.append(work);
    tr.append(cell);
    summary.append(tr);
  });
  main.append(summary);

  const progress = snap.lessonProgress.filter((row) => row.programId === programId);
  main.append(el("h2", {}, "Lesson participation"));
  main.append(el("p", { class: "muted" }, "Support means the student continued with help. It is not an official test attempt."));
  const head = el("tr");
  ["Student", "Lesson", "Topic", "Status", "Support", "Updated", "Artifact"].forEach((label) => head.append(el("th", {}, label)));
  const table = el("table");
  table.append(head);
  if (!progress.length) {
    const empty = el("tr");
    empty.append(el("td", { colspan: "7" }, "No lesson progress in this program yet."));
    table.append(empty);
  }
  progress.forEach((row) => {
    const tr = el("tr");
    [row.username, row.lessonId, row.topicId, row.status, row.support ? "Yes" : "", row.updatedAt, row.artifact].forEach((value) => {
      tr.append(el("td", {}, value));
    });
    table.append(tr);
  });
  main.append(table);
}

export function readLessonDrafts(): LessonDraft[] {
  return PUBLISHED_LESSONS.map((pack, index) => {
    const enabled = document.getElementById(`lesson-on-${pack.slug}`) as HTMLInputElement | null;
    const sort = document.getElementById(`lesson-sort-${pack.slug}`) as HTMLInputElement | null;
    const open = document.getElementById(`lesson-open-${pack.slug}`) as HTMLInputElement | null;
    const close = document.getElementById(`lesson-close-${pack.slug}`) as HTMLInputElement | null;
    const require = document.getElementById(`lesson-pre-${pack.slug}`) as HTMLInputElement | null;
    return {
      lessonId: pack.lessonId,
      enabled: Boolean(enabled?.checked),
      sortOrder: Number(sort?.value || index + 1),
      openAt: open?.value || "",
      closeAt: close?.value || "",
      requirePre: Boolean(require?.checked),
    };
  });
}
