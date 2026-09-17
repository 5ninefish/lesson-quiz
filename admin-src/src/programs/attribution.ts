import { PROGRAM } from "../config";
import type { AttemptView, ResultAttribution, ResultView } from "../types";

export function attributeResults(results: ResultView[], attempts: AttemptView[]): ResultView[] {
  const bySub = new Map<string, AttemptView>();
  for (const a of attempts) {
    if (a.submissionId) bySub.set(a.submissionId, a);
  }
  return results.map((r) => {
    if (r.submissionId && bySub.has(r.submissionId)) {
      const a = bySub.get(r.submissionId)!;
      const programId = a.programId || PROGRAM.legacyDefaultProgramId;
      return { ...r, programId, attribution: "attempt" as ResultAttribution };
    }
    return {
      ...r,
      programId: PROGRAM.legacyDefaultProgramId,
      attribution: "legacy_default" as ResultAttribution,
    };
  });
}

export function countByAttribution(results: ResultView[], kind: ResultAttribution): number {
  return results.filter((r) => r.attribution === kind).length;
}
