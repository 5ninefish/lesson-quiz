import type { BestScoreRow, ResultView } from "../types";
import type { TestId } from "../ids";

function denMatchesBank(den: number, expected: number | undefined): boolean {
  return expected != null && expected > 0 && den === expected;
}

function betterScore(
  candidate: { percent: number; den: number; timestamp: string },
  prev: { percent: number; scoreDen: number; timestamp: string },
  expectedDen: number | undefined,
): boolean {
  const candOk = denMatchesBank(candidate.den, expectedDen);
  const prevOk = denMatchesBank(prev.scoreDen, expectedDen);
  if (candOk !== prevOk) return candOk;
  if (candidate.percent !== prev.percent) return candidate.percent > prev.percent;
  return Boolean(candidate.timestamp && prev.timestamp && candidate.timestamp < prev.timestamp);
}

export function bestCompleteScores(results: ResultView[], questionCounts: Partial<Record<TestId, number>> = {}): BestScoreRow[] {
  const map = new Map<string, BestScoreRow>();
  for (const r of results) {
    if (!r.complete || !r.testId || r.scoreNum == null || r.scoreDen == null || r.scoreDen <= 0) continue;
    const key = `${r.username}::${r.testId}`;
    const percent = r.scoreNum / r.scoreDen;
    const prev = map.get(key);
    const next: BestScoreRow = {
      username: r.username,
      testId: r.testId as TestId,
      scoreNum: r.scoreNum,
      scoreDen: r.scoreDen,
      percent,
      timestamp: r.timestamp,
      completeCount: 1,
      cycle: r.cycle,
      complete: r.complete,
      answers: r.answers,
    };
    if (!prev) {
      map.set(key, next);
      continue;
    }
    const win = betterScore(
      { percent, den: r.scoreDen, timestamp: r.timestamp },
      prev,
      questionCounts[r.testId],
    );
    map.set(key, {
      ...(win ? next : prev),
      completeCount: prev.completeCount + 1,
    });
  }
  return [...map.values()].sort((a, b) => a.username.localeCompare(b.username) || a.testId.localeCompare(b.testId));
}

export function formatScore(num: number, den: number): string {
  return `${num}/${den}`;
}
