/** Science tests that still use Students columns L1–L6 and CycleL1–CycleL6. */
export const COLUMN_TEST_IDS = [
  "SCI-SOIL",
  "SCI-CORAL",
  "SCI-CS",
  "SCI-ASTRO",
  "SCI-HEALTH",
  "SCI-DM",
] as const;

/** Post-tests whose sits live on ProgramStudentState, not extra Students columns. */
export const EXTRA_TEST_IDS = [
  "TEAMS-MIND",
  "MENT-SCI",
  "MENT-INT",
  "MENT-ROLE",
  "MENT-SORT",
  "MENT-AROUND",
  "INT-1",
  "INT-2",
  "INT-3",
  "COL-INTRO",
  "COL-EARLY",
  "COL-APP",
  "COL-PS",
  "COL-PRE",
  "COL-PAY",
  "COL-CAREER",
  "COL-SERV",
] as const;

export const TEST_IDS = [...COLUMN_TEST_IDS, ...EXTRA_TEST_IDS] as const;

export type TestId = (typeof TEST_IDS)[number];

export const LESSON_TO_TEST: Record<string, TestId> = {
  L1: "SCI-SOIL",
  L2: "SCI-CORAL",
  L3: "SCI-CS",
  L4: "SCI-ASTRO",
  L5: "SCI-HEALTH",
  L6: "SCI-DM",
  T1: "TEAMS-MIND",
  M1: "MENT-SCI",
  M2: "MENT-INT",
  M3: "MENT-ROLE",
  M4: "MENT-SORT",
  M5: "MENT-AROUND",
  I1: "INT-1",
  I2: "INT-2",
  I3: "INT-3",
  C1: "COL-INTRO",
  C2: "COL-EARLY",
  C3: "COL-APP",
  C4: "COL-PS",
  C5: "COL-PRE",
  C6: "COL-PAY",
  C7: "COL-CAREER",
  C8: "COL-SERV",
};

export const TEST_TO_LESSON: Record<TestId, string> = {
  "SCI-SOIL": "L1",
  "SCI-CORAL": "L2",
  "SCI-CS": "L3",
  "SCI-ASTRO": "L4",
  "SCI-HEALTH": "L5",
  "SCI-DM": "L6",
  "TEAMS-MIND": "T1",
  "MENT-SCI": "M1",
  "MENT-INT": "M2",
  "MENT-ROLE": "M3",
  "MENT-SORT": "M4",
  "MENT-AROUND": "M5",
  "INT-1": "I1",
  "INT-2": "I2",
  "INT-3": "I3",
  "COL-INTRO": "C1",
  "COL-EARLY": "C2",
  "COL-APP": "C3",
  "COL-PS": "C4",
  "COL-PRE": "C5",
  "COL-PAY": "C6",
  "COL-CAREER": "C7",
  "COL-SERV": "C8",
};

export const TEST_TITLES: Record<TestId, string> = {
  "SCI-SOIL": "Soil — Science Lesson 1",
  "SCI-CORAL": "3D Printing & Coral — Science Lesson 2",
  "SCI-CS": "Computer Science — Science Lesson 3",
  "SCI-ASTRO": "Astronomy — Science Lesson 4",
  "SCI-HEALTH": "Health — Science Lesson 5",
  "SCI-DM": "Digital Media — Science Lesson 6",
  "TEAMS-MIND": "Hōkūlani Mindset",
  "MENT-SCI": "What a Scientist Does",
  "MENT-INT": "Interviews for Internships, Scholarships, and Work",
  "MENT-ROLE": "Role Models",
  "MENT-SORT": "STEM Interests and Career Card Sort",
  "MENT-AROUND": "STEM Is All Around Us",
  "INT-1": "Introduction to the CLD TEAMS Internship",
  "INT-2": "Getting to Know My Team and Internship",
  "INT-3": "Meeting My Internship Mentor",
  "COL-INTRO": "Introduction to College and STEM Majors",
  "COL-EARLY": "Early College and Dual Credit",
  "COL-APP": "College Application and Resume Building",
  "COL-PS": "Personal Statement",
  "COL-PRE": "STEM Prerequisites and Course Planning",
  "COL-PAY": "Ways to Pay for College",
  "COL-CAREER": "STEM Career Development at College",
  "COL-SERV": "Campus Student Service Programs",
};

export function isTestId(value: string): value is TestId {
  return (TEST_IDS as readonly string[]).includes(value);
}

export function canonicalTestId(raw: string | null | undefined): TestId | null {
  const v = String(raw || "").trim();
  if (!v) return null;
  const upper = v.toUpperCase();
  if (isTestId(upper)) return upper;
  const mapped = LESSON_TO_TEST[upper];
  return mapped || null;
}

export function normalizeUsername(raw: string | null | undefined): string {
  return String(raw || "").trim().toLowerCase();
}
