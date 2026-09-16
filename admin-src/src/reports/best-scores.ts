import type { BestScoreRow, ResultView } from "../types";
import type { TestId } from "../ids";

export function bestCompleteScores(results: ResultView[]): BestScoreRow[] {
  const map = new Map<string, BestScoreRow>();
  for (const r of results) {
    if (!r.complete || !r.testId || r.scoreNum == null || r.scoreDen == null || r.scoreDen <= 0) continue;
    const key = `${r.username}::${r.testId}`;
    const percent = r.scoreNum / r.scoreDen;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, {
        username: r.username,
        testId: r.testId as TestId,
        scoreNum: r.scoreNum,
        scoreDen: r.scoreDen,
        percent,
        timestamp: r.timestamp,
        completeCount: 1,
      });
      continue;
    }
    const better =
      percent > prev.percent ||
      (percent === prev.percent && r.timestamp && prev.timestamp && r.timestamp < prev.timestamp);
    map.set(key, {
      username: prev.username,
      testId: prev.testId,
      scoreNum: better ? r.scoreNum : prev.scoreNum,
      scoreDen: better ? r.scoreDen : prev.scoreDen,
      percent: better ? percent : prev.percent,
      timestamp: better ? r.timestamp : prev.timestamp,
      completeCount: prev.completeCount + 1,
    });
  }
  return [...map.values()].sort((a, b) => a.username.localeCompare(b.username) || a.testId.localeCompare(b.testId));
}
