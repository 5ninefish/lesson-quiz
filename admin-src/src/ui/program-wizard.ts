import { TEST_IDS, TEST_TITLES } from "../ids";
import { buildLaunchPlan, defaultDraft, type WizardDraft } from "../programs/launcher";
import { suggestProgramId } from "../programs/ids";
import { instructorProgramUrl, studentProgramUrl } from "../programs/urls";
import type { DashboardSnapshot, LaunchPlan, ReleaseManual } from "../types";
import { el } from "./dom";

export type WizardState = {
  step: 1 | 2 | 3 | 4 | 5;
  draft: WizardDraft;
};

export function emptyWizard(name = ""): WizardState {
  return { step: 1, draft: defaultDraft(name) };
}

export function renderWizard(
  main: HTMLElement,
  snap: DashboardSnapshot,
  wizard: WizardState,
  onChange: (next: WizardState) => void,
  onCancel: () => void,
  onLaunch: (plan: LaunchPlan) => void,
): void {
  main.append(el("h1", {}, "Create program"));
  const steps = el("p", { class: "muted" }, `Step ${wizard.step} of 5`);
  main.append(steps);

  if (wizard.step === 1) stepInfo(main, wizard, onChange);
  if (wizard.step === 2) stepStudents(main, snap, wizard, onChange);
  if (wizard.step === 3) stepTests(main, snap, wizard, onChange);
  if (wizard.step === 4) stepConfig(main, wizard, onChange);
  if (wizard.step === 5) stepReview(main, snap, wizard, onLaunch);

  const nav = el("div", { class: "toolbar" });
  const back = el("button", { type: "button" }, wizard.step === 1 ? "Cancel" : "Back");
  back.onclick = () => {
    if (wizard.step === 1) onCancel();
    else onChange({ ...wizard, step: (wizard.step - 1) as WizardState["step"], draft: readWizardDom(wizard.draft) });
  };
  const next = el("button", { type: "button", class: "primary" }, wizard.step === 5 ? "Stay on review" : "Next");
  next.onclick = () => {
    if (wizard.step < 5) {
      onChange({ ...wizard, step: (wizard.step + 1) as WizardState["step"], draft: readWizardDom(wizard.draft) });
    }
  };
  nav.append(back);
  if (wizard.step < 5) nav.append(next);
  main.append(nav);
}

function stepInfo(main: HTMLElement, wizard: WizardState, _onChange: (next: WizardState) => void): void {
  const name = field(main, "Program name", wizard.draft.programName, () => {}, "wizard-name");
  name.autocomplete = "off";
  const slug = field(main, "Program ID (slug)", wizard.draft.programId, () => {}, "wizard-id");
  let slugTouched = Boolean(wizard.draft.programId) && wizard.draft.programId !== suggestProgramId(wizard.draft.programName);
  name.addEventListener("input", () => {
    if (!slugTouched) slug.value = suggestProgramId(name.value);
  });
  slug.addEventListener("input", () => {
    slugTouched = true;
  });
  field(main, "Start (optional)", wizard.draft.startAt, () => {}, "wizard-start");
  field(main, "End (optional)", wizard.draft.endAt, () => {}, "wizard-end");
  const status = el("label", {}, "Initial status");
  const sel = el("select", { id: "wizard-status" }) as HTMLSelectElement;
  sel.append(new Option("Draft", "DRAFT"), new Option("Active", "ACTIVE"));
  sel.value = wizard.draft.status;
  main.append(status, sel);
}

function stepStudents(main: HTMLElement, snap: DashboardSnapshot, wizard: WizardState, _onChange: (next: WizardState) => void): void {
  const selected = new Set(wizard.draft.usernames);
  const count = el("p", { id: "wizard-selected-count" }, `${selected.size} selected`);
  main.append(count);
  const search = el("input", {
    type: "text",
    id: "wizard-student-search",
    placeholder: "Search students",
    autocomplete: "off",
  }) as HTMLInputElement;
  main.append(search);
  const list = el("div", { class: "picker-list", id: "wizard-student-list" });
  const paintList = () => {
    const q = search.value.trim().toLowerCase();
    list.replaceChildren();
    for (const s of snap.students) {
      if (q && !s.username.includes(q)) continue;
      const other = snap.programStudents.filter((m) => m.username === s.username).map((m) => m.programId);
      const row = el("label", { class: "picker-row" });
      const cb = el("input", { type: "checkbox", "data-username": s.username }) as HTMLInputElement;
      cb.checked = selected.has(s.username);
      cb.onchange = () => {
        if (cb.checked) selected.add(s.username);
        else selected.delete(s.username);
        count.textContent = `${selected.size} selected`;
      };
      row.append(cb, document.createTextNode(` ${s.username}${other.length ? ` (${other.join(", ")})` : ""}`));
      list.append(row);
    }
  };
  const tools = el("div", { class: "toolbar", id: "wizard-student-tools" });
  const all = el("button", { type: "button" }, "Select all visible");
  all.onclick = () => {
    list.querySelectorAll<HTMLInputElement>("input[data-username]").forEach((cb) => {
      cb.checked = true;
      selected.add(cb.dataset.username || "");
    });
    count.textContent = `${selected.size} selected`;
  };
  const none = el("button", { type: "button" }, "Clear all visible");
  none.onclick = () => {
    list.querySelectorAll<HTMLInputElement>("input[data-username]").forEach((cb) => {
      cb.checked = false;
      selected.delete(cb.dataset.username || "");
    });
    count.textContent = `${selected.size} selected`;
  };
  tools.append(all, none);
  main.append(tools, list);
  search.addEventListener("input", paintList);
  paintList();
}

function readWizardDom(draft: WizardDraft): WizardDraft {
  const next = { ...draft };
  const name = document.getElementById("wizard-name") as HTMLInputElement | null;
  const id = document.getElementById("wizard-id") as HTMLInputElement | null;
  const start = document.getElementById("wizard-start") as HTMLInputElement | null;
  const end = document.getElementById("wizard-end") as HTMLInputElement | null;
  const status = document.getElementById("wizard-status") as HTMLSelectElement | null;
  if (name) next.programName = name.value;
  if (id) next.programId = id.value;
  if (start) next.startAt = start.value;
  if (end) next.endAt = end.value;
  if (status && (status.value === "DRAFT" || status.value === "ACTIVE")) next.status = status.value;
  if (document.getElementById("wizard-student-list")) {
    next.usernames = [...document.querySelectorAll<HTMLInputElement>("#wizard-student-list input[data-username]:checked")].map(
      (cb) => cb.dataset.username || "",
    );
  }
  return next;
}

function stepTests(main: HTMLElement, snap: DashboardSnapshot, wizard: WizardState, onChange: (next: WizardState) => void): void {
  const selected = new Map(wizard.draft.tests.map((t) => [t.testId, t]));
  TEST_IDS.forEach((id, i) => {
    const count = snap.questionCounts[id] || 0;
    const row = el("label", { class: "picker-row" });
    const cb = el("input", { type: "checkbox" }) as HTMLInputElement;
    cb.checked = selected.has(id);
    cb.onchange = () => {
      if (cb.checked) {
        selected.set(id, {
          testId: id,
          sortOrder: selected.size + 1,
          manual: "UNSET",
          openAt: "",
          closeAt: "",
          maxTries: 2,
          timeLimitMinutes: 0,
        });
      } else selected.delete(id);
      onChange({ ...wizard, draft: { ...wizard.draft, tests: [...selected.values()] } });
    };
    const order = el("input", { type: "number", min: "1", value: String(selected.get(id)?.sortOrder || i + 1) }) as HTMLInputElement;
    order.onchange = () => {
      const cur = selected.get(id);
      if (cur) {
        cur.sortOrder = Number(order.value) || i + 1;
        onChange({ ...wizard, draft: { ...wizard.draft, tests: [...selected.values()] } });
      }
    };
    row.append(cb, document.createTextNode(` ${TEST_TITLES[id]} (${id}, ${count} questions) `), order);
    if (count === 0) row.append(el("span", { class: "sev-error" }, " no valid questions"));
    main.append(row);
  });
}

function stepConfig(main: HTMLElement, wizard: WizardState, onChange: (next: WizardState) => void): void {
  wizard.draft.tests.forEach((t, i) => {
    const box = el("section", { class: "release-card" });
    box.append(el("h2", {}, TEST_TITLES[t.testId]));
    const manual = el("select") as HTMLSelectElement;
    for (const m of ["UNSET", "OPEN", "CLOSED", "AUTO"] as ReleaseManual[]) manual.append(new Option(m, m));
    manual.value = t.manual;
    manual.onchange = () => updateTest(wizard, i, { manual: manual.value as ReleaseManual }, onChange);
    box.append(el("label", {}, "Initial state"), manual);
    const open = field(box, "Open at", t.openAt, (v) => updateTest(wizard, i, { openAt: v }, onChange));
    const close = field(box, "Close at", t.closeAt, (v) => updateTest(wizard, i, { closeAt: v }, onChange));
    void open;
    void close;
    field(box, "Max attempts", String(t.maxTries), (v) => updateTest(wizard, i, { maxTries: Number(v) || 2 }, onChange));
    field(box, "Timer (minutes)", String(t.timeLimitMinutes), (v) =>
      updateTest(wizard, i, { timeLimitMinutes: Number(v) || 0 }, onChange),
    );
    main.append(box);
  });
}

function stepReview(main: HTMLElement, snap: DashboardSnapshot, wizard: WizardState, onLaunch: (plan: LaunchPlan) => void): void {
  const plan = buildLaunchPlan({
    draft: { ...wizard.draft, nowHst: new Date().toISOString(), actor: "instructor" },
    existingProgramIds: snap.programs.map((p) => p.programId),
    students: snap.students,
    questions: snap.questions,
  });
  main.append(el("p", {}, `${plan.program.programName} (${plan.program.programId}) · ${plan.program.status}`));
  main.append(el("p", {}, `${plan.students.length} students · ${plan.tests.length} tests`));
  main.append(el("p", { class: "mono" }, studentProgramUrl(plan.program.programId)));
  main.append(el("p", { class: "mono" }, instructorProgramUrl(plan.program.programId)));
  for (const t of plan.tests) {
    main.append(
      el(
        "p",
        {},
        `${t.title}: ${t.manual}, max ${t.maxTries}, timer ${t.timeLimitSec}s (${t.timeLimitSec / 60} min stored from minutes)`,
      ),
    );
  }
  main.append(el("h2", {}, "Sheet rows to add"));
  for (const row of plan.rows) {
    main.append(el("p", { class: "mono" }, `${row.tab}: ${row.values.join(" | ")}`));
  }
  for (const w of plan.warnings) main.append(el("p", { class: "sev-warn" }, w));
  for (const b of plan.blocking) main.append(el("p", { class: "sev-error" }, b));
  const launch = el("button", { type: "button", class: "primary", id: "btn-launch-program" }, "Launch Program");
  launch.disabled = plan.blocking.length > 0;
  launch.onclick = () => onLaunch(plan);
  main.append(launch);
}

function updateTest(
  wizard: WizardState,
  i: number,
  patch: Partial<WizardDraft["tests"][number]>,
  onChange: (next: WizardState) => void,
): void {
  const tests = wizard.draft.tests.map((t, idx) => (idx === i ? { ...t, ...patch } : t));
  onChange({ ...wizard, draft: { ...wizard.draft, tests } });
}

function field(parent: HTMLElement, label: string, value: string, onInput: (v: string) => void, id?: string): HTMLInputElement {
  parent.append(el("label", {}, label));
  const attrs: Record<string, string> = { type: "text", value };
  if (id) attrs.id = id;
  const input = el("input", attrs) as HTMLInputElement;
  input.addEventListener("input", () => onInput(input.value));
  parent.append(input);
  return input;
}
