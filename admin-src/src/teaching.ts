export type PublishedLesson = {
  lessonId: string;
  title: string;
  version: string;
  slug: string;
  assessmentId: string;
  linked: boolean;
};

/** Published teaching packages. Sustainability stays unlinked from SCI-CORAL. */
export const PUBLISHED_LESSONS: PublishedLesson[] = [
  { lessonId: "sci-cs@2026-10", title: "Computer Science", version: "2026-10", slug: "sci-cs", assessmentId: "SCI-CS", linked: true },
  { lessonId: "sci-health@2026-10", title: "Health", version: "2026-10", slug: "sci-health", assessmentId: "SCI-HEALTH", linked: true },
  { lessonId: "sci-astro@2026-10", title: "Astronomy", version: "2026-10", slug: "sci-astro", assessmentId: "SCI-ASTRO", linked: true },
  { lessonId: "sci-soil@2026-10", title: "Soil", version: "2026-10", slug: "sci-soil", assessmentId: "SCI-SOIL", linked: true },
  { lessonId: "sci-sust@2026-10", title: "Sustainability", version: "2026-10", slug: "sci-sust", assessmentId: "", linked: false },
];
