export const PROGRAM = {
  code: "hokulani",
  title: "Hōkūlani Post-Test Portal",
  spreadsheetId: "1wFjzB6PgjhZjHWBcgLLVOa1TtBvaEDqoV8PGFYoX3EI",
  googleClientId: "",
  timezone: "Pacific/Honolulu",
} as const;

export const RANGES = {
  students: "Students!A:N",
  questions: "Questions!A:I",
  releases: "Releases!A:H",
  attempts: "Attempts!A:K",
  results: "Results!A:X",
  audit: "Audit!A:D",
} as const;

export const FORBIDDEN_VIEW_KEYS = [
  "password",
  "passwordhash",
  "hash",
  "correct",
  "correctsnapshot",
  "access_token",
  "accesstoken",
] as const;
