import { secondsToMinutes } from "../programs/ids";
import { releaseMutation } from "../releases/mutations";
import type { DashboardSnapshot, ProgramTestView } from "../types";
import { confirmDialog } from "./dialogs";
import { el } from "./dom";

export function renderReleases(
  main: HTMLElement,
  snap: DashboardSnapshot,
  programId: string,
  canWrite: boolean,
  onPreview: (text: string) => void,
): void {
  main.append(el("h1", {}, "Releases"));
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
  for (const t of tests) main.append(testCard(t, canWrite, onPreview));
}

function testCard(t: ProgramTestView, canWrite: boolean, onPreview: (text: string) => void): HTMLElement {
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
  add("Open now", () => previewAction(t, "open", onPreview));
  add("Close now", () => previewAction(t, "close", onPreview));
  add("Schedule window", () => schedule(t, onPreview));
  add("Set attempts", () => attempts(t, onPreview));
  add("Set time limit", () => timer(t, onPreview));
  add("Return to legacy default", () => previewAction(t, "unset", onPreview));
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
  onPreview: (text: string) => void,
): void {
  const planned = releaseMutation({
    current: t,
    action,
    actor: "instructor",
    nowHst: new Date().toISOString(),
  });
  confirmDialog({
    title: `${action} ${t.testId}`,
    body: `Program: ${t.programId}\nTest: ${t.testId}\nBefore: ${planned.preview.before.join(" | ")}\nAfter: ${planned.preview.after.join(" | ")}\n\nLive workbook writes are blocked until Dalen approves a workbook copy.`,
    confirmLabel: "Record preview",
    onConfirm: () => onPreview(planned.preview.description),
  });
}

function schedule(t: ProgramTestView, onPreview: (text: string) => void): void {
  const openAt = window.prompt("Open at (ISO HST)", t.openAt) || "";
  const closeAt = window.prompt("Close at (ISO HST)", t.closeAt) || "";
  const planned = releaseMutation({
    current: t,
    action: "schedule",
    openAt,
    closeAt,
    actor: "instructor",
    nowHst: new Date().toISOString(),
  });
  confirmDialog({
    title: `Schedule ${t.testId}`,
    body: `Manual AUTO\n${openAt} → ${closeAt}\nWrites stay on a workbook copy first.`,
    onConfirm: () => onPreview(planned.preview.description),
  });
}

function attempts(t: ProgramTestView, onPreview: (text: string) => void): void {
  const raw = window.prompt("Maximum attempts (positive integer)", String(t.maxTries));
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return;
  const planned = releaseMutation({
    current: t,
    action: "attempts",
    maxTries: n,
    actor: "instructor",
    nowHst: new Date().toISOString(),
  });
  confirmDialog({
    title: `Set attempts ${t.testId}`,
    body: `${t.maxTries} → ${n}`,
    onConfirm: () => onPreview(planned.preview.description),
  });
}

function timer(t: ProgramTestView, onPreview: (text: string) => void): void {
  const raw = window.prompt("Time limit in minutes (0 = none)", String(secondsToMinutes(t.timeLimitSec)));
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return;
  const planned = releaseMutation({
    current: t,
    action: "timer",
    timeLimitMinutes: n,
    actor: "instructor",
    nowHst: new Date().toISOString(),
  });
  confirmDialog({
    title: `Set timer ${t.testId}`,
    body: `${secondsToMinutes(t.timeLimitSec)} min → ${n} min (${planned.next.timeLimitSec}s stored)`,
    onConfirm: () => onPreview(planned.preview.description),
  });
}
