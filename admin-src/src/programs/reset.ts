import type { TestId } from "../ids";
import type { AttemptView, ProgramStateView } from "../types";
import { attemptInProgram } from "./summaries";

export type CycleResetPlan = {
  updates: Array<{ range: string; values: string[][] }>;
  appends: Array<{ tab: string; values: string[][] }>;
  blocking: string[];
  summary: string;
};

export function planCycleReset(opts: {
  programId: string;
  username: string;
  testId: string;
  state: ProgramStateView[];
  enabledTestIds: TestId[];
  attempts: AttemptView[];
  actor: string;
  nowHst: string;
}): CycleResetPlan {
  const blocking: string[] = [];
  const username = opts.username.trim().toLowerCase();
  if (!username) blocking.push("Choose a student.");
  const testIds = opts.testId === "ALL" ? [...opts.enabledTestIds] : opts.enabledTestIds.filter((id) => id === opts.testId);
  if (!testIds.length) blocking.push("Choose an enabled assessment in this program.");

  const updates: CycleResetPlan["updates"] = [];
  const stateRows: string[][] = [];
  for (const testId of testIds) {
    const row = opts.state.find(
      (s) => s.programId === opts.programId && s.username === username && s.testId === testId,
    );
    if (row?.rowNumber) {
      updates.push({
        range: `ProgramStudentState!D${row.rowNumber}:G${row.rowNumber}`,
        values: [[String((row.cycle || 1) + 1), "0", opts.nowHst, opts.actor]],
      });
    } else {
      stateRows.push([opts.programId, username, testId, "2", "0", opts.nowHst, opts.actor]);
    }
  }
  const appends: CycleResetPlan["appends"] = [];
  if (stateRows.length) appends.push({ tab: "ProgramStudentState", values: stateRows });

  const wanted = new Set(testIds);
  for (const attempt of opts.attempts) {
    if (attempt.username !== username) continue;
    if (!attempt.testId || !wanted.has(attempt.testId)) continue;
    if (!attemptInProgram(attempt, opts.programId)) continue;
    if (attempt.status !== "in_flight" && attempt.displayStatus !== "in_flight") continue;
    updates.push({
      range: `Attempts!J${attempt.rowNumber}`,
      values: [["reset"]],
    });
  }

  if (!blocking.length && (updates.length || appends.length)) {
    appends.push({
      tab: "Audit",
      values: [[
        opts.nowHst,
        opts.actor,
        "reset_cycle",
        `${opts.programId} ${username} tests=${testIds.join(",")} history kept`,
      ]],
    });
  }

  return {
    updates,
    appends,
    blocking,
    summary: `${username} in ${opts.programId}: new cycle for ${testIds.join(", ") || "no tests"}. Other programs are not changed.`,
  };
}
