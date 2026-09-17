import { PROGRAM, RANGES } from "../config";
import { getAccessToken } from "../auth/google-token";
import type { RawWorkbook } from "../workbook/snapshot";
import type { SheetValues } from "../workbook/cells";

export type WorkbookMeta = { name: string; canEdit: boolean };

export async function loadWorkbookMeta(signal?: AbortSignal): Promise<WorkbookMeta> {
  const token = getAccessToken();
  if (!token) throw Object.assign(new Error("sign_in"), { code: "sign_in" });
  const url = `https://www.googleapis.com/drive/v3/files/${PROGRAM.spreadsheetId}?fields=name,capabilities/canEdit&supportsAllDrives=true`;
  const res = await fetch(url, { signal, headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) throw Object.assign(new Error("sign_in"), { code: "sign_in" });
  if (res.status === 403) throw Object.assign(new Error("permission"), { code: "permission" });
  if (res.status === 429) throw Object.assign(new Error("quota"), { code: "quota" });
  if (!res.ok) throw Object.assign(new Error("network"), { code: "network" });
  const json = await res.json();
  return { name: json.name || "Workbook", canEdit: Boolean(json.capabilities?.canEdit) };
}

export async function loadRawWorkbook(signal?: AbortSignal): Promise<RawWorkbook> {
  const token = getAccessToken();
  if (!token) throw Object.assign(new Error("sign_in"), { code: "sign_in" });
  const titles = await listSheetTitles(signal);
  const wanted = Object.entries(RANGES).filter(([, range]) => {
    const tab = range.split("!")[0];
    return titles.length === 0 || titles.includes(tab);
  });
  const ranges = wanted.map(([, r]) => `ranges=${encodeURIComponent(r)}`).join("&");
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${PROGRAM.spreadsheetId}/values:batchGet?${ranges}`;
  const res = await fetch(url, { signal, headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) throw Object.assign(new Error("sign_in"), { code: "sign_in" });
  if (res.status === 403) throw Object.assign(new Error("permission"), { code: "permission" });
  if (res.status === 429) throw Object.assign(new Error("quota"), { code: "quota" });
  if (!res.ok) throw Object.assign(new Error("network"), { code: "network" });
  const json = await res.json();
  const valueRanges: { range?: string; values?: SheetValues }[] = json.valueRanges || [];
  const pick = (name: keyof typeof RANGES): SheetValues => {
    const needle = RANGES[name].split("!")[0].toLowerCase();
    const hit = valueRanges.find((vr) => String(vr.range || "").toLowerCase().includes(needle));
    return hit?.values || [];
  };
  return {
    students: pick("students"),
    questions: pick("questions"),
    releases: pick("releases"),
    attempts: pick("attempts"),
    results: pick("results"),
    audit: pick("audit"),
    programs: pick("programs"),
    programStudents: pick("programStudents"),
    programTests: pick("programTests"),
    programStudentState: pick("programStudentState"),
  };
}

async function listSheetTitles(signal?: AbortSignal): Promise<string[]> {
  const token = getAccessToken();
  if (!token) return [];
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${PROGRAM.spreadsheetId}?fields=sheets.properties.title`;
  const res = await fetch(url, { signal, headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return [];
  const json = await res.json();
  return ((json.sheets || []) as { properties?: { title?: string } }[]).map((s) => s.properties?.title || "").filter(Boolean);
}
