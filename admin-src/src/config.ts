export const PROGRAM = {
  code: "hokulani",
  title: "Hōkūlani Post-Test Portal",
  /** The sheet students use. The instructor page reads and writes this book. */
  liveStudentSpreadsheetId: "1wFjzB6PgjhZjHWBcgLLVOa1TtBvaEDqoV8PGFYoX3EI",
  spreadsheetId: "1wFjzB6PgjhZjHWBcgLLVOa1TtBvaEDqoV8PGFYoX3EI",
  googleClientId: "920320221741-sdr3g7lcijko53f7tu7t0e225801pvu4.apps.googleusercontent.com",
  timezone: "Pacific/Honolulu",
  /** Existing Pages origin until Dalen approves the custom-domain cutover. */
  publicOrigin: "https://5ninefish.github.io/lesson-quiz",
  customDomain: "https://portal.projecthokulani.com",
  useCustomDomain: false,
  adminPath: "/admin-v2/",
  legacyAdminPath: "/lesson-quiz/admin-v2/",
  legacyDefaultProgramId: "hokulani",
  /** Existing Apps Script web app. New versions keep this deployment id and URL. */
  studentServiceUrl:
    "https://script.google.com/macros/s/AKfycbz3Acc6aICeaolVb1KaFiVG4HSMH83NkRWv-2YIcvrHdVAT8-E39uShWuJ25dqB37V9/exec",
  studentDeploymentId: "AKfycbz3Acc6aICeaolVb1KaFiVG4HSMH83NkRWv-2YIcvrHdVAT8-E39uShWuJ25dqB37V9",
} as const;

export const RANGES = {
  students: "Students!A:P",
  questions: "Questions!A:J",
  releases: "Releases!A:H",
  attempts: "Attempts!A:N",
  results: "Results!A:AZ",
  audit: "Audit!A:H",
  programs: "Programs!A:I",
  programStudents: "ProgramStudents!A:E",
  programTests: "ProgramTests!A:N",
  programStudentState: "ProgramStudentState!A:H",
  testCatalog: "TestCatalog!A:G",
  lessonCatalog: "LessonCatalog!A:E",
  programLessons: "ProgramLessons!A:J",
  lessonProgress: "LessonProgress!A:I",
} as const;

export const PROGRAM_TABLES = ["Programs", "ProgramStudents", "ProgramTests", "ProgramStudentState"] as const;

export const PROGRAM_HEADERS = {
  Programs: ["ProgramId", "ProgramName", "Status", "StartAt", "EndAt", "CreatedAtHST", "CreatedBy", "UpdatedAtHST", "UpdatedBy"],
  ProgramStudents: ["ProgramId", "Username", "Active", "AssignedAtHST", "AssignedBy"],
  ProgramTests: [
    "ProgramId",
    "TestId",
    "Enabled",
    "SortOrder",
    "Manual",
    "OpenAt",
    "CloseAt",
    "MaxTries",
    "TimeLimitSec",
    "UpdatedAtHST",
    "UpdatedBy",
    "Phase",
    "LessonId",
    "AssessmentVersion",
  ],
  ProgramStudentState: ["ProgramId", "Username", "TestId", "Cycle", "SitCache", "UpdatedAtHST", "UpdatedBy", "Phase"],
} as const;

export function workbookUrl(spreadsheetId: string = PROGRAM.spreadsheetId): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
}

export const WRITE_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
export const READ_SCOPES =
  "openid email profile https://www.googleapis.com/auth/drive.metadata.readonly https://www.googleapis.com/auth/spreadsheets.readonly";

export const FORBIDDEN_VIEW_KEYS = [
  "password",
  "passwordhash",
  "hash",
  "correct",
  "correctsnapshot",
  "access_token",
  "accesstoken",
] as const;
