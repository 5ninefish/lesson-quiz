import type { TestId } from "./ids";

export type HealthSeverity = "info" | "warn" | "error";

export type HealthIssue = {
  id: string;
  severity: HealthSeverity;
  tab: string;
  rowNumber: number | null;
  message: string;
};

export type StudentView = {
  username: string;
  rowNumber: number;
  sits: Record<TestId, number | null>;
  cycles: Record<TestId, number | null>;
};

export type QuestionView = {
  testId: TestId;
  number: string;
  prompt: string;
  options: string[];
  rowNumber: number;
};

export type ReleaseManual = "UNSET" | "OPEN" | "CLOSED" | "AUTO";

export type ReleaseView = {
  testId: TestId;
  strand: string;
  title: string;
  openAt: string;
  closeAt: string;
  manual: ReleaseManual;
  maxTries: number | null;
  timeLimitSec: number | null;
  rowNumber: number;
  state: "open" | "closed" | "scheduled" | "hidden" | "malformed";
  stateLabel: string;
};

export type AttemptStatus = "in_flight" | "done" | "expired" | "malformed";

export type AttemptView = {
  username: string;
  testId: TestId | null;
  cycle: number | null;
  submissionId: string;
  startedAt: string;
  timeLimitSec: number | null;
  status: AttemptStatus;
  displayStatus: AttemptStatus;
  deadlineAt: string | null;
  remainingSec: number | null;
  rowNumber: number;
  rawTestId: string;
};

export type ResultView = {
  username: string;
  testId: TestId | null;
  rawTestId: string;
  timestamp: string;
  cycle: number | null;
  lifetimeSeq: number | null;
  scoreNum: number | null;
  scoreDen: number | null;
  answers: string[];
  complete: boolean;
  submissionId: string;
  status: string;
  rowNumber: number;
  source: "headered" | "positional";
};

export type AuditView = {
  timestamp: string;
  actor: string;
  action: string;
  detail: string;
  rowNumber: number;
};

export type BestScoreRow = {
  username: string;
  testId: TestId;
  scoreNum: number;
  scoreDen: number;
  percent: number;
  timestamp: string;
  completeCount: number;
};

export type MissingRow = {
  username: string;
  missing: TestId[];
};

export type DashboardSnapshot = {
  fetchedAt: string;
  students: StudentView[];
  questions: QuestionView[];
  releases: ReleaseView[];
  attempts: AttemptView[];
  results: ResultView[];
  audit: AuditView[];
  issues: HealthIssue[];
  bestScores: BestScoreRow[];
  missing: MissingRow[];
  questionCounts: Record<TestId, number>;
  skippedBlankStudents: number;
  resultsHeaderMode: "header" | "positional" | "empty";
};
