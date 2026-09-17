import { TEST_TITLES, type TestId } from "../ids";
import { studentTestUrl } from "../programs/urls";

const REQUIRED_SENTENCE = "Please complete these assessments this week.";

export function looksLikeEmail(username: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username);
}

export function studentDisplayName(username: string): string {
  const local = username.split("@")[0] || username;
  return local.replace(/[._]/g, " ");
}

export function missingEmailSubject(programName: string): string {
  return `[${programName}] — missing post-tests`;
}

export function missingEmailBody(opts: {
  username: string;
  programId: string;
  programName: string;
  missing: TestId[];
}): string {
  const lines = opts.missing.map((id) => `- ${TEST_TITLES[id]}: ${studentTestUrl(opts.programId, id)}`);
  return [
    `Hi ${studentDisplayName(opts.username)},`,
    "",
    "Our records show that you still need to complete the following assessments:",
    "",
    ...lines,
    "",
    REQUIRED_SENTENCE,
    "",
    "Contact us if you have trouble opening a test.",
  ].join("\n");
}

export function emailContainsForbiddenDate(body: string): boolean {
  return /\b20\d{2}-\d{2}-\d{2}\b/.test(body) || /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(body);
}

export function mailtoHref(to: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export { REQUIRED_SENTENCE };
