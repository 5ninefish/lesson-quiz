export type RosterImportRow = {
  username: string;
  email: string;
  password: string;
};

export type RosterImportPreview = {
  accepted: RosterImportRow[];
  rejected: Array<{ line: number; reason: string }>;
  duplicates: Array<{ line: number; username: string }>;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeUser(raw: string): string {
  return raw.trim().toLowerCase();
}

export function parseRosterPaste(text: string, existingUsernames: string[]): RosterImportPreview {
  const existing = new Set(existingUsernames.map((u) => normalizeUser(u)));
  const seen = new Set<string>();
  const accepted: RosterImportRow[] = [];
  const rejected: RosterImportPreview["rejected"] = [];
  const duplicates: RosterImportPreview["duplicates"] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    const lineNo = index + 1;
    const parts = line.split(/[,\t]/).map((p) => p.trim());
    if (parts[0].toLowerCase() === "username" && parts.some((p) => p.toLowerCase() === "email")) return;
    const username = normalizeUser(parts[0] || "");
    const email = (parts[1] || "").trim();
    const password = parts.slice(2).join(",").trim();
    if (!username) {
      rejected.push({ line: lineNo, reason: "Username is blank." });
      return;
    }
    if (!/^[a-z0-9._@+-]+$/.test(username)) {
      rejected.push({ line: lineNo, reason: `Username "${username}" has unsupported characters.` });
      return;
    }
    if (email && !EMAIL_RE.test(email)) {
      rejected.push({ line: lineNo, reason: `Email for ${username} is not a full address.` });
      return;
    }
    if (!password) {
      rejected.push({ line: lineNo, reason: `Password for ${username} is blank.` });
      return;
    }
    if (existing.has(username) || seen.has(username)) {
      duplicates.push({ line: lineNo, username });
      return;
    }
    seen.add(username);
    accepted.push({ username, email, password });
  });
  return { accepted, rejected, duplicates };
}

export function buildStudentRows(
  headers: string[],
  accepted: RosterImportRow[],
): { values: string[][]; blocking: string[] } {
  const blocking: string[] = [];
  const idx = (name: string) => headers.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
  const userCol = idx("Username");
  const emailCol = idx("Email");
  const passCol = idx("Password") >= 0 ? idx("Password") : idx("PasswordHash");
  if (userCol < 0) blocking.push("Students sheet has no Username header.");
  if (passCol < 0) blocking.push("Students sheet has no Password column. Add one before importing.");
  if (blocking.length || !accepted.length) return { values: [], blocking };
  const width = Math.max(headers.length, passCol + 1, userCol + 1);
  const values = accepted.map((row) => {
    const out = Array.from({ length: width }, () => "");
    out[userCol] = row.username;
    if (emailCol >= 0) out[emailCol] = row.email;
    out[passCol] = row.password;
    for (let n = 1; n <= 6; n++) {
      const sit = idx(`L${n}`);
      const cycle = idx(`CycleL${n}`);
      if (sit >= 0) out[sit] = "0";
      if (cycle >= 0) out[cycle] = "1";
    }
    return out;
  });
  return { values, blocking };
}

export function pageOf<T>(rows: T[], page: number, size: number): { page: number; pages: number; rows: T[] } {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(Math.max(1, page), pages);
  const start = (current - 1) * size;
  return { page: current, pages, rows: rows.slice(start, start + size) };
}
