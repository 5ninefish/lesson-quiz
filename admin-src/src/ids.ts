export const TEST_IDS = [
  "SCI-SOIL",
  "SCI-CORAL",
  "SCI-CS",
  "SCI-ASTRO",
  "SCI-HEALTH",
  "SCI-DM",
] as const;

export type TestId = (typeof TEST_IDS)[number];

export const LESSON_TO_TEST: Record<string, TestId> = {
  L1: "SCI-SOIL",
  L2: "SCI-CORAL",
  L3: "SCI-CS",
  L4: "SCI-ASTRO",
  L5: "SCI-HEALTH",
  L6: "SCI-DM",
};

export const TEST_TO_LESSON: Record<TestId, string> = {
  "SCI-SOIL": "L1",
  "SCI-CORAL": "L2",
  "SCI-CS": "L3",
  "SCI-ASTRO": "L4",
  "SCI-HEALTH": "L5",
  "SCI-DM": "L6",
};

export const TEST_TITLES: Record<TestId, string> = {
  "SCI-SOIL": "Soil — Science Lesson 1",
  "SCI-CORAL": "3D Printing & Coral — Science Lesson 2",
  "SCI-CS": "Computer Science — Science Lesson 3",
  "SCI-ASTRO": "Astronomy — Science Lesson 4",
  "SCI-HEALTH": "Health — Science Lesson 5",
  "SCI-DM": "Digital Media — Science Lesson 6",
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
