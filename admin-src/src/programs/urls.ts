import { PROGRAM } from "../config";

export function publicOrigin(): string {
  return PROGRAM.useCustomDomain ? PROGRAM.customDomain : PROGRAM.publicOrigin;
}

export function studentProgramUrl(programId: string): string {
  const base = publicOrigin().replace(/\/$/, "");
  return `${base}/?program=${encodeURIComponent(programId)}`;
}

export function studentTestUrl(programId: string, testId: string): string {
  const base = publicOrigin().replace(/\/$/, "");
  return `${base}/?program=${encodeURIComponent(programId)}&test=${encodeURIComponent(testId)}`;
}

export function instructorProgramUrl(programId: string): string {
  const origin = publicOrigin().replace(/\/$/, "");
  const path = PROGRAM.useCustomDomain ? PROGRAM.adminPath : PROGRAM.legacyAdminPath;
  return `${origin.replace(/\/lesson-quiz$/, "")}${path}?program=${encodeURIComponent(programId)}`;
}

export function urlHasNoStudentData(url: string): boolean {
  const u = url.toLowerCase();
  return !u.includes("username=") && !u.includes("password=") && !u.includes("submission") && !u.includes("score=");
}
