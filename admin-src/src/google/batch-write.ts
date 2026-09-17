import { PROGRAM } from "../config";
import { getAccessToken } from "../auth/google-token";
import type { MutationPreview } from "../types";

export type BatchWriteRequest = {
  spreadsheetId?: string;
  valueUpdates: Array<{ range: string; values: string[][] }>;
  addSheets?: string[];
};

function copyWorkbookId(): string {
  const target = String(PROGRAM.spreadsheetId);
  const live = String(PROGRAM.liveStudentSpreadsheetId);
  if (target === live) {
    throw Object.assign(new Error("refusing to write the live student workbook"), { code: "permission" });
  }
  return target;
}

export async function executeBatchWrite(req: BatchWriteRequest): Promise<{ ok: true } | { ok: false; code: string }> {
  const token = getAccessToken();
  if (!token) return { ok: false, code: "sign_in" };
  const id = req.spreadsheetId || copyWorkbookId();
  if (req.addSheets?.length) {
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: req.addSheets.map((title) => ({ addSheet: { properties: { title } } })),
      }),
    });
    if (!res.ok) return { ok: false, code: res.status === 403 ? "permission" : "network" };
  }
  if (!req.valueUpdates.length) return { ok: true };
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchUpdate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      valueInputOption: "RAW",
      data: req.valueUpdates.map((u) => ({ range: u.range, values: u.values })),
    }),
  });
  if (!res.ok) return { ok: false, code: res.status === 403 ? "permission" : "network" };
  return { ok: true };
}

export { copyWorkbookId };

export async function executeSpreadsheetRequests(requests: unknown[]): Promise<{ ok: true } | { ok: false; code: string }> {
  if (!requests.length) return { ok: true };
  const token = getAccessToken();
  if (!token) return { ok: false, code: "sign_in" };
  const id = copyWorkbookId();
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ requests }),
  });
  if (!res.ok) return { ok: false, code: res.status === 403 ? "permission" : "network" };
  return { ok: true };
}

export async function appendRows(tab: string, values: string[][]): Promise<{ ok: true } | { ok: false; code: string }> {
  if (!values.length) return { ok: true };
  const token = getAccessToken();
  if (!token) return { ok: false, code: "sign_in" };
  const id = copyWorkbookId();
  const range = encodeURIComponent(`${tab}!A:A`);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values }),
    },
  );
  if (!res.ok) return { ok: false, code: res.status === 403 ? "permission" : "network" };
  return { ok: true };
}

export function auditAppend(preview: MutationPreview, actor: string, nowHst: string): { range: string; values: string[][] } {
  return {
    range: "Audit!A:D",
    values: [[nowHst, actor, preview.id, preview.description]],
  };
}
