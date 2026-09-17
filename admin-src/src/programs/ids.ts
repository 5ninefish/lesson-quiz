export const PROGRAM_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function normalizeProgramId(raw: string | null | undefined): string {
  return String(raw || "")
    .trim()
    .toLowerCase();
}

export function isValidProgramId(raw: string | null | undefined): boolean {
  const id = normalizeProgramId(raw);
  return PROGRAM_ID_RE.test(id);
}

export function suggestProgramId(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function minutesToSeconds(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes < 0) return 0;
  return Math.round(minutes * 60);
}

export function secondsToMinutes(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return seconds / 60;
}
