import { el } from "./dom";

export function confirmDialog(opts: {
  title: string;
  body: string;
  confirmLabel?: string;
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
  const cancel = el("button", { type: "button" }, "Cancel");
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

export function closeDialogs(): void {
  document.getElementById("dialog-overlay")?.remove();
}
