export type SheetValues = (string | number | boolean | null)[][];

export function cell(row: (string | number | boolean | null)[] | undefined, i: number): string {
  if (!row || i < 0 || i >= row.length) return "";
  const v = row[i];
  if (v == null || v === false) return "";
  return String(v).trim();
}

export function asInt(raw: string): number | null {
  if (!raw) return null;
  const n = Number(String(raw).replace(/,/g, ""));
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  return n;
}

export function asBool(raw: string): boolean {
  const v = raw.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes" || v === "y" || v === "active";
}

export function headerIndex(headers: string[], name: string): number {
  const n = name.trim().toLowerCase();
  return headers.findIndex((h) => h.trim().toLowerCase() === n);
}

export function looksLikeHeaderRow(row: (string | number | boolean | null)[] | undefined, names: string[]): boolean {
  if (!row) return false;
  const headers = row.map((c) => String(c ?? "").trim());
  let hits = 0;
  for (const name of names) {
    if (headerIndex(headers, name) >= 0) hits += 1;
  }
  return hits >= 3;
}

export function rowHasContent(row: (string | number | boolean | null)[] | undefined): boolean {
  if (!row) return false;
  return row.some((c) => String(c ?? "").trim() !== "");
}
