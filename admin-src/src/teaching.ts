export type PublishedLesson = {
  lessonId: string;
  title: string;
  version: string;
  slug: string;
  assessmentId: string;
  linked: boolean;
  topicCount: number;
};

/** Published teaching packages. Sustainability stays unlinked from SCI-CORAL.
 *  Mentoring is a domain. Interviews, the career card sort, and What a Scientist Does are built.
 *  The other four mentoring lessons stay in lessons/mentoring/catalog.json.
 */
export const PUBLISHED_LESSONS: PublishedLesson[] = [
  { lessonId: "sci-cs@2026-10", title: "Computer Science", version: "2026-10", slug: "sci-cs", assessmentId: "SCI-CS", linked: true, topicCount: 8 },
  { lessonId: "sci-health@2026-10", title: "Health", version: "2026-10", slug: "sci-health", assessmentId: "SCI-HEALTH", linked: true, topicCount: 8 },
  { lessonId: "sci-astro@2026-10", title: "Astronomy", version: "2026-10", slug: "sci-astro", assessmentId: "SCI-ASTRO", linked: true, topicCount: 8 },
  { lessonId: "sci-soil@2026-10", title: "Soil", version: "2026-10", slug: "sci-soil", assessmentId: "SCI-SOIL", linked: true, topicCount: 8 },
  { lessonId: "sci-sust@2026-10", title: "Sustainability", version: "2026-10", slug: "sci-sust", assessmentId: "", linked: false, topicCount: 8 },
  { lessonId: "ment-interviews@2026-10", title: "Interviews", version: "2026-10", slug: "ment-interviews", assessmentId: "MENT-INT", linked: true, topicCount: 8 },
  { lessonId: "ment-card-sort@2026-10", title: "STEM Interests and Career Card Sort", version: "2026-10", slug: "ment-card-sort", assessmentId: "MENT-SORT", linked: true, topicCount: 8 },
  { lessonId: "ment-scientist@2026-10", title: "What a Scientist Does", version: "2026-10", slug: "ment-scientist", assessmentId: "MENT-SCI", linked: true, topicCount: 8 },
];
