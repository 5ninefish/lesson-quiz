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
  programId: string;
};

export type ResultAttribution = "attempt" | "legacy_default" | "unassigned";

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
  programId: string;
  attribution: ResultAttribution;
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
  cycle: number | null;
  complete: boolean;
};

export type MissingRow = {
  username: string;
  missing: TestId[];
  availability: string;
};

export type ProgramStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

export type ProgramView = {
  programId: string;
  programName: string;
  status: ProgramStatus;
  startAt: string;
  endAt: string;
  createdAtHst: string;
  createdBy: string;
  updatedAtHst: string;
  updatedBy: string;
  rowNumber: number;
};

export type ProgramStudentView = {
  programId: string;
  username: string;
  active: boolean;
  assignedAtHst: string;
  assignedBy: string;
  rowNumber: number;
};

export type ProgramTestView = {
  programId: string;
  testId: TestId;
  enabled: boolean;
  sortOrder: number;
  manual: ReleaseManual;
  openAt: string;
  closeAt: string;
  maxTries: number;
  timeLimitSec: number;
  updatedAtHst: string;
  updatedBy: string;
  rowNumber: number;
  title: string;
  state: ReleaseView["state"];
  stateLabel: string;
};

export type ProgramStateView = {
  programId: string;
  username: string;
  testId: TestId;
  cycle: number;
  sitCache: number;
  updatedAtHst: string;
  updatedBy: string;
  rowNumber: number;
};

export type ProgramSummary = {
  program: ProgramView;
  assignedStudents: number;
  activeStudents: number;
  assignedTests: number;
  enabledTests: number;
  openTests: number;
  scheduledTests: number;
  closedTests: number;
  hiddenTests: number;
  activeAttempts: number;
  missingStudents: number;
  studentUrl: string;
  instructorUrl: string;
};

export type LaunchPlanRow = { tab: string; values: string[] };

export type LaunchPlan = {
  program: ProgramView;
  students: ProgramStudentView[];
  tests: ProgramTestView[];
  state: ProgramStateView[];
  rows: LaunchPlanRow[];
  blocking: string[];
  warnings: string[];
};

export type MutationPreview = {
  id: string;
  tab: string;
  range: string;
  before: string[];
  after: string[];
  description: string;
  rowNumber: number;
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
  programs: ProgramView[];
  programStudents: ProgramStudentView[];
  programTests: ProgramTestView[];
  programState: ProgramStateView[];
  programTablesPresent: boolean;
  missingProgramTables: string[];
  legacyAttributedResults: number;
  unassignedResults: number;
};
