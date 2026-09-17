import { TEST_TITLES, type TestId } from "../ids";
import { looksLikeEmail, mailtoHref, missingEmailBody, missingEmailSubject } from "../missing/email-template";
import { studentTestUrl } from "../programs/urls";
import type { DashboardSnapshot, MissingRow } from "../types";
import { closeDialogs } from "./dialogs";
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

export function renderMissing(main: HTMLElement, snap: DashboardSnapshot, programId: string, programName: string): void {
  main.append(el("h1", {}, "Missing tests"));
  main.append(
    el(
      "p",
      { class: "muted" },
      "Assigned tests only. Complete means every expected answer is present. Best score is not used.",
    ),
  );
  const wrap = el("div", { class: "table-wrap" });
  const t = el("table");
  const head = el("thead");
  const hr = el("tr");
  for (const h of ["Student", "Missing count", "Missing tests", "Availability", "Email"]) hr.append(el("th", {}, h));
  head.append(hr);
  const tb = el("tbody");
  for (const row of snap.missing) {
    const tr = el("tr");
    const studentCell = el("td");
    if (looksLikeEmail(row.username)) {
      const btn = el("button", { type: "button", class: "linkish" }, row.username);
      btn.onclick = () => openEmailDialog(row, programId, programName);
      studentCell.append(btn);
    } else {
      studentCell.textContent = row.username;
    }
    tr.append(studentCell);
    tr.append(el("td", {}, String(row.missing.length)));
    const tests = el("td");
    row.missing.forEach((id, i) => {
      if (i) tests.append(document.createTextNode("; "));
      const a = el("a", { href: studentTestUrl(programId, id), target: "_blank", rel: "noopener" }, TEST_TITLES[id]);
      tests.append(a);
    });
    tr.append(tests);
    tr.append(el("td", {}, row.availability || "—"));
    const emailTd = el("td");
    const emailBtn = el("button", { type: "button" }, "Compose");
    emailBtn.onclick = () => openEmailDialog(row, programId, programName);
    emailTd.append(emailBtn);
    tr.append(emailTd);
    tb.append(tr);
  }
  t.append(head, tb);
  wrap.append(t);
  main.append(wrap);
}

function openEmailDialog(row: MissingRow, programId: string, programName: string): void {
  closeDialogs();
  const subject = missingEmailSubject(programName);
  const body = missingEmailBody({ username: row.username, programId, programName, missing: row.missing as TestId[] });
  const overlay = el("div", { class: "dialog-overlay", id: "dialog-overlay" });
  const box = el("div", { class: "dialog", role: "dialog", "aria-modal": "true" });
  box.append(el("h2", {}, "Student email"));
  box.append(el("label", { for: "email-to" }, "To"));
  const to = el("input", { id: "email-to", type: "text", value: row.username }) as HTMLInputElement;
  to.readOnly = true;
  box.append(to);
  box.append(el("label", { for: "email-subject" }, "Subject"));
  const sub = el("input", { id: "email-subject", type: "text", value: subject }) as HTMLInputElement;
  box.append(sub);
  box.append(el("label", { for: "email-body" }, "Message"));
  const ta = el("textarea", { id: "email-body", rows: "14" }) as HTMLTextAreaElement;
  ta.value = body;
  box.append(ta);
  const actions = el("div", { class: "dialog-actions" });
  const copySub = el("button", { type: "button" }, "Copy subject");
  copySub.onclick = () => void copyText(sub.value);
  const copyMsg = el("button", { type: "button" }, "Copy message");
  copyMsg.onclick = () => void copyText(ta.value);
  const copyAll = el("button", { type: "button" }, "Copy all");
  copyAll.onclick = () => void copyText(`To: ${to.value}\nSubject: ${sub.value}\n\n${ta.value}`);
  const draft = el("button", { type: "button", class: "primary" }, "Open email draft");
  const canMailto = looksLikeEmail(row.username);
  draft.disabled = !canMailto;
  draft.onclick = () => {
    if (!canMailto) return;
    window.location.href = mailtoHref(to.value, sub.value, ta.value);
  };
  const close = el("button", { type: "button" }, "Close");
  close.onclick = () => closeDialogs();
  actions.append(copySub, copyMsg, copyAll, draft, close);
  box.append(actions);
  overlay.append(box);
  document.body.append(overlay);
}
