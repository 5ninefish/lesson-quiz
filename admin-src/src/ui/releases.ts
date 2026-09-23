import { secondsToMinutes } from "../programs/ids";
import { releaseMutation } from "../releases/mutations";
import type { DashboardSnapshot, MutationPreview, ProgramTestView } from "../types";
import { confirmDialog } from "./dialogs";
import { el } from "./dom";
import { pageHeading } from "./help";

export function renderReleases(
  main: HTMLElement,
  snap: DashboardSnapshot,
  programId: string,
  canWrite: boolean,
  actor: string,
  onApply: (preview: MutationPreview) => void,
): void {
  pageHeading(main, "Releases", "releases");
  main.append(
    el(
      "p",
      { class: "muted" },
      canWrite
        ? "Open, close, schedule, attempts, and timer write ProgramTests after confirmation."
        : "Read-only. Enable editing (workbook editors only) to change releases. Quiz Admin is no longer required once writes are on.",
    ),
  );
  const tests = snap.programTests
    .filter((t) => t.programId === programId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  if (!tests.length) {
    main.append(el("p", {}, "No ProgramTests for this program. Seed or launch first."));
    return;
  }
  for (const t of tests) main.append(testCard(t, canWrite, actor, onApply));
}

function testCard(
  t: ProgramTestView,
  canWrite: boolean,
  actor: string,
  onApply: (preview: MutationPreview) => void,
): HTMLElement {
  const card = el("section", { class: "release-card" });
  card.append(el("h2", {}, `${t.title}`));
  card.append(el("p", { class: "muted" }, `${t.testId} · ${t.stateLabel} · Manual ${t.manual}`));
  const meta = el("p");
  meta.textContent = `Window ${t.openAt || "—"} → ${t.closeAt || "—"} · Max ${t.maxTries} · Timer ${secondsToMinutes(t.timeLimitSec)} min (${t.timeLimitSec}s) · Row ${t.rowNumber}`;
  card.append(meta);
  const actions = el("div", { class: "toolbar" });
  const add = (label: string, fn: () => void) => {
    const b = el("button", { type: "button" }, label);
    b.disabled = !canWrite;
    b.onclick = fn;
    actions.append(b);
  };
  add("Open now", () => previewAction(t, "open", actor, onApply));
  add("Close now", () => previewAction(t, "close", actor, onApply));
  add("Schedule window", () => schedule(t, actor, onApply));
  add("Set attempts", () => attempts(t, actor, onApply));
  add("Set time limit", () => timer(t, actor, onApply));
  add("Return to legacy default", () => previewAction(t, "unset", actor, onApply));
  const missing = el("button", { type: "button" }, "View missing students");
  missing.onclick = () => {
    const btn = document.querySelector<HTMLButtonElement>('#nav button[data-screen="missing"]');
    btn?.click();
  };
  actions.append(missing);
  card.append(actions);
  return card;
}

function previewAction(
  t: ProgramTestView,
  action: "open" | "close" | "unset",
  actor: string,
  onApply: (preview: MutationPreview) => void,
): void {
  const planned = releaseMutation({
    current: t,
    action,
    actor,
    nowHst: new Date().toISOString(),
  });
  const verb = action === "open" ? "Open" : action === "close" ? "Close" : "Update";
  confirmDialog({
    title: `${verb} ${t.title}`,
    body: `${t.title} is ${t.manual} and will become ${planned.next.manual}.\n\nThis saves on the workbook this page is reading.`,
    confirmLabel: verb === "Open" ? "Open test" : "Save",
    onConfirm: () => onApply(planned.preview),
  });
}

function schedule(t: ProgramTestView, actor: string, onApply: (preview: MutationPreview) => void): void {
  const openAt = window.prompt("Open at", t.openAt) || "";
  const closeAt = window.prompt("Close at", t.closeAt) || "";
  const planned = releaseMutation({
    current: t,
    action: "schedule",
    openAt,
    closeAt,
    actor,
    nowHst: new Date().toISOString(),
  });
  confirmDialog({
    title: `Schedule ${t.title}`,
    body: `${openAt || "no open time"} → ${closeAt || "no close time"}\n\nThis saves on the workbook this page is reading.`,
    confirmLabel: "Save",
    onConfirm: () => onApply(planned.preview),
  });
}

function attempts(t: ProgramTestView, actor: string, onApply: (preview: MutationPreview) => void): void {
  const raw = window.prompt("Maximum attempts (whole number, at least 1)", String(t.maxTries));
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return;
  const planned = releaseMutation({
    current: t,
    action: "attempts",
    maxTries: n,
    actor,
    nowHst: new Date().toISOString(),
  });
  confirmDialog({
    title: `Set attempts for ${t.title}`,
    body: `${t.maxTries} → ${n}`,
    confirmLabel: "Save",
    onConfirm: () => onApply(planned.preview),
  });
}

function timer(t: ProgramTestView, actor: string, onApply: (preview: MutationPreview) => void): void {
  const raw = window.prompt("Time limit in minutes (0 = none)", String(secondsToMinutes(t.timeLimitSec)));
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return;
  const planned = releaseMutation({
    current: t,
    action: "timer",
    timeLimitMinutes: n,
    actor,
    nowHst: new Date().toISOString(),
  });
  confirmDialog({
    title: `Set timer for ${t.title}`,
    body: `${secondsToMinutes(t.timeLimitSec)} min → ${n} min`,
    confirmLabel: "Save",
    onConfirm: () => onApply(planned.preview),
  });
}
