import type { ItemMark } from "../reports/item-review";
import { el } from "./dom";

export function confirmDialog(opts: {
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
}): void {
  closeDialogs();
  const overlay = el("div", { class: "dialog-overlay", id: "dialog-overlay" });
  const box = el("div", { class: "dialog", role: "dialog", "aria-modal": "true" });
  box.append(el("h2", {}, opts.title));
  const p = el("p");
  p.style.whiteSpace = "pre-wrap";
  p.textContent = opts.body;
  box.append(p);
  const actions = el("div", { class: "dialog-actions" });
  const cancel = el("button", { type: "button" }, opts.cancelLabel || "Cancel");
  cancel.onclick = () => {
    closeDialogs();
    opts.onCancel?.();
  };
  const ok = el("button", { type: "button", class: "primary" }, opts.confirmLabel || "Confirm");
  ok.onclick = () => {
    closeDialogs();
    opts.onConfirm();
  };
  actions.append(cancel, ok);
  box.append(actions);
  overlay.append(box);
  overlay.addEventListener("click", (ev) => {
    if (ev.target === overlay) closeDialogs();
  });
  document.body.append(overlay);
  ok.focus();
}

export function infoDialog(title: string, body: string): void {
  closeDialogs();
  const overlay = el("div", { class: "dialog-overlay", id: "dialog-overlay" });
  const box = el("div", { class: "dialog help-dialog", role: "dialog", "aria-modal": "true" });
  box.append(el("h2", {}, title));
  const p = el("div", { class: "help-body" });
  p.textContent = body;
  box.append(p);
  const actions = el("div", { class: "dialog-actions" });
  const close = el("button", { type: "button", class: "primary" }, "Close");
  close.onclick = () => closeDialogs();
  actions.append(close);
  box.append(actions);
  overlay.append(box);
  overlay.addEventListener("click", (ev) => {
    if (ev.target === overlay) closeDialogs();
  });
  document.body.append(overlay);
  close.focus();
}

export function scoreDialog(title: string, items: ItemMark[]): void {
  closeDialogs();
  const overlay = el("div", { class: "dialog-overlay", id: "dialog-overlay" });
  const box = el("div", { class: "dialog help-dialog", role: "dialog", "aria-modal": "true" });
  box.append(el("h2", {}, title));
  const list = el("div", { class: "score-list" });
  if (!items.length) {
    list.append(el("p", {}, "This test has no questions on the Questions sheet."));
  }
  for (const item of items) {
    const block = el("div", { class: "score-item" });
    const head = el("strong", {}, `Question ${item.number}: ${item.verdict}`);
    if (item.verdict === "Right") head.classList.add("mark-right");
    if (item.verdict === "Wrong") head.classList.add("mark-wrong");
    const prompt = el("p");
    prompt.textContent = item.prompt;
    const detail = el("p", { class: "muted" });
    detail.textContent = item.detail;
    block.append(head, prompt, detail);
    list.append(block);
  }
  box.append(list);
  const actions = el("div", { class: "dialog-actions" });
  const close = el("button", { type: "button", class: "primary" }, "Close");
  close.onclick = () => closeDialogs();
  actions.append(close);
  box.append(actions);
  overlay.append(box);
  overlay.addEventListener("click", (ev) => {
    if (ev.target === overlay) closeDialogs();
  });
  document.body.append(overlay);
  close.focus();
}

export function closeDialogs(): void {
  document.getElementById("dialog-overlay")?.remove();
}
