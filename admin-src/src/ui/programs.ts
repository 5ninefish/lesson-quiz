import { summarizeProgram } from "../programs/summaries";
import { instructorProgramUrl, studentProgramUrl } from "../programs/urls";
import type { DashboardSnapshot, ProgramView } from "../types";
import { confirmDialog } from "./dialogs";
import { el } from "./dom";

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.append(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

export function renderPrograms(
  main: HTMLElement,
  snap: DashboardSnapshot,
  selectedProgramId: string,
  opts: {
    canEdit: boolean;
    onOpen: (id: string) => void;
    onWizard: () => void;
    onArchive: (id: string) => void;
    onDuplicate: (id: string) => void;
    onInit: () => void;
  },
): void {
  main.append(el("h1", {}, "Programs"));
  if (!snap.programTablesPresent) {
    main.append(
      el(
        "p",
        { class: "muted" },
        `Missing tabs: ${snap.missingProgramTables.join(", ")}. Create only those four tabs. Never run setup().`,
      ),
    );
    const init = el("button", { type: "button", class: "primary" }, "Initialize Program Launcher");
    init.disabled = !opts.canEdit;
    init.onclick = () => opts.onInit();
    main.append(init);
    return;
  }

  const create = el("button", { type: "button", class: "primary" }, "Create program");
  create.onclick = () => opts.onWizard();
  main.append(create);

  for (const program of snap.programs) {
    const sum = summarizeProgram(snap, program);
    const card = el("section", { class: "program-card" });
    if (program.programId === selectedProgramId) card.classList.add("selected");
    card.append(el("h2", {}, program.programName));
    card.append(el("p", { class: "muted" }, `${program.programId} · ${program.status}`));
    card.append(
      el(
        "p",
        {},
        `${sum.activeStudents}/${sum.assignedStudents} students · ${sum.enabledTests} tests · open ${sum.openTests} · scheduled ${sum.scheduledTests} · closed ${sum.closedTests} · hidden ${sum.hiddenTests}`,
      ),
    );
    card.append(el("p", {}, `Active attempts ${sum.activeAttempts} · Students missing a test ${sum.missingStudents}`));
    card.append(el("p", { class: "mono" }, sum.studentUrl));
    card.append(el("p", { class: "mono" }, sum.instructorUrl));
    card.append(el("p", { class: "muted" }, `Updated ${program.updatedAtHst} ${program.updatedBy}`));
    const actions = el("div", { class: "toolbar" });
    const open = el("button", { type: "button" }, "Open dashboard");
    open.onclick = () => opts.onOpen(program.programId);
    const copyS = el("button", { type: "button" }, "Copy student link");
    copyS.onclick = () => void copyText(studentProgramUrl(program.programId));
    const copyI = el("button", { type: "button" }, "Copy instructor link");
    copyI.onclick = () => void copyText(instructorProgramUrl(program.programId));
    const edit = el("button", { type: "button" }, "Edit assignments");
    edit.onclick = () => opts.onWizard();
    const arch = el("button", { type: "button" }, "Archive");
    arch.disabled = program.status === "ARCHIVED";
    arch.onclick = () => {
      confirmDialog({
        title: `Archive ${program.programName}?`,
        body: "Archiving never deletes records. Confirm to mark ARCHIVED.",
        onConfirm: () => opts.onArchive(program.programId),
      });
    };
    const dup = el("button", { type: "button" }, "Duplicate configuration");
    dup.onclick = () => opts.onDuplicate(program.programId);
    actions.append(open, copyS, copyI, edit, arch, dup);
    card.append(actions);
    main.append(card);
  }
}

export function duplicateConfig(source: ProgramView): { name: string; idHint: string } {
  return { name: `${source.programName} copy`, idHint: `${source.programId}-copy` };
}
