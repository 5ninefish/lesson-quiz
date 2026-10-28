import { PROGRAM } from "../config";
import type { AttemptView, ResultAttribution, ResultView } from "../types";
import { normalizeProgramId } from "./ids";

export function attributeResults(results: ResultView[], attempts: AttemptView[]): ResultView[] {
  const bySub = new Map<string, AttemptView | "conflict">();
  for (const attempt of attempts) {
    if (!attempt.submissionId) continue;
    const prev = bySub.get(attempt.submissionId);
    if (!prev) {
      bySub.set(attempt.submissionId, attempt);
      continue;
    }
    if (prev === "conflict") continue;
    if (normalizeProgramId(prev.programId) !== normalizeProgramId(attempt.programId)) bySub.set(attempt.submissionId, "conflict");
  }
  return results.map((result) => {
    const explicit = normalizeProgramId(result.programId);
    const joined = result.submissionId ? bySub.get(result.submissionId) : undefined;
    if (joined === "conflict") {
      return { ...result, programId: "", attribution: "unassigned" as ResultAttribution };
    }
    const attemptProgram = joined ? normalizeProgramId(joined.programId) : "";
    if (explicit && attemptProgram && explicit !== attemptProgram) {
      return { ...result, programId: "", attribution: "unassigned" as ResultAttribution };
    }
    if (explicit) {
      return {
        ...result,
        programId: explicit,
        attribution: (attemptProgram ? "attempt" : "explicit") as ResultAttribution,
      };
    }
    if (joined) {
      return {
        ...result,
        programId: attemptProgram || PROGRAM.legacyDefaultProgramId,
        attribution: "attempt" as ResultAttribution,
      };
    }
    return {
      ...result,
      programId: PROGRAM.legacyDefaultProgramId,
      attribution: "legacy_default" as ResultAttribution,
    };
  });
}

export function countByAttribution(results: ResultView[], kind: ResultAttribution): number {
  return results.filter((r) => r.attribution === kind).length;
}
