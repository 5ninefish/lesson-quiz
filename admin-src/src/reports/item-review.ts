import type { QuestionView } from "../types";

export type ItemMark = {
  number: string;
  prompt: string;
  verdict: "Right" | "Wrong" | "No answer key";
  detail: string;
};

function optionText(options: string[], letter: string): string {
  const idx = letter.charCodeAt(0) - 65;
  if (!letter || idx < 0 || idx >= options.length) return "";
  return options[idx] || "";
}

function asLetter(raw: string, options: string[]): string {
  const t = raw.trim();
  if (!t) return "";
  const up = t.toUpperCase();
  if (/^[A-F]$/.test(up)) return up;
  const idx = options.findIndex((o) => o.trim().toLowerCase() === t.toLowerCase());
  return idx >= 0 ? String.fromCharCode(65 + idx) : up;
}

/** Compare one sit's answers. A pinned key reviews that attempt. Without one, the current bank is labeled by the caller. */
export function reviewSit(questions: QuestionView[], answers: string[], pinnedKey?: string[]): ItemMark[] {
  const ordered = [...questions].sort((a, b) => Number(a.number) - Number(b.number) || a.rowNumber - b.rowNumber);
  return ordered.map((q, index) => {
    const given = asLetter(answers[Number(q.number) - 1] || answers[index] || "", q.options);
    const key = (pinnedKey && pinnedKey.length ? pinnedKey[Number(q.number) - 1] || pinnedKey[index] || "" : q.keyLetter).trim().toUpperCase();
    const givenText = optionText(q.options, given);
    const keyText = optionText(q.options, key);
    const choice = given ? `${given}${givenText ? `. ${givenText}` : ""}` : "blank";
    if (!key) {
      return {
        number: q.number,
        prompt: q.prompt,
        verdict: "No answer key",
        detail: `They answered ${choice}. The Correct column for this question is blank, so right or wrong cannot be shown.`,
      };
    }
    const right = given !== "" && given === key;
    const keyLabel = `${key}${keyText ? `. ${keyText}` : ""}`;
    return {
      number: q.number,
      prompt: q.prompt,
      verdict: right ? "Right" : "Wrong",
      detail: right ? `They answered ${choice}.` : `They answered ${choice}. The right answer is ${keyLabel}.`,
    };
  });
}
