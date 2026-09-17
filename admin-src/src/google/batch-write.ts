import { PROGRAM } from "../config";
import { getAccessToken } from "../auth/google-token";
import type { MutationPreview } from "../types";

export type BatchWriteRequest = {
  spreadsheetId?: string;
  valueUpdates: Array<{ range: string; values: string[][] }>;
  addSheets?: string[];
};

export async function executeBatchWrite(req: BatchWriteRequest): Promise<{ ok: true } | { ok: false; code: string }> {
  const token = getAccessToken();
  if (!token) return { ok: false, code: "sign_in" };
  const id = req.spreadsheetId || PROGRAM.spreadsheetId;
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

export function auditAppend(preview: MutationPreview, actor: string, nowHst: string): { range: string; values: string[][] } {
  return {
    range: "Audit!A:D",
    values: [[nowHst, actor, preview.id, preview.description]],
  };
}
