# Mentoring domain

Mentoring is a domain a cohort can include. It is not a cohort and not a program. Cohorts are Fall Interns, Spring Interns, Summer 1, Summer 2, and names like those. One student has one cohort. That cohort can include Science, Mentoring, College Transition, and Internship.

Do not create a program called Mentoring, Teaching Mentoring, or Preview. Do not show the word Teaching on the student dashboard.

The seven lessons are listed in `catalog.json`. Interviews is built at `lessons/ment-interviews/`. STEM Interests and Career Card Sort is built at `lessons/ment-card-sort/`. The other five are not built. Do not add those five to `TEACHING_PACKAGES` or `PUBLISHED_LESSONS`, and do not enable a lesson on a cohort, until that lesson can be opened.

Interviews and the card sort are registered in source. Do not enable either lesson on a cohort until Dalen publishes this package in the same Apps Script deployment. Version 18 does not include these judges. Do not click Deploy. Do not load a question bank for `MENT-INT` or `MENT-SORT`. The official items stay off the page.

## How to add one lesson

Follow `lessons/sci-cs/`: `content.json`, `index.html`, and `media/`. The shared runner is `lessons/runner.js`.

- Lesson id: `ment-<slug>@2026-10`
- Folder: `lessons/ment-<slug>/`
- Page: `https://5ninefish.github.io/lesson-quiz/lessons/ment-<slug>/`
- A lesson id that starts with `ment-` appears in the Mentoring section. Science lessons stay under Science.
- When `linked` is true, PRE and POST both use that assessment id. Music and Sports stay unlinked. Do not invent a bank, and do not attach another lesson’s bank.
- Official answers stay on the server. Do not put an answer key in the page, the catalog, or a commit.

Register a finished lesson in both places:

- `LessonBridge.gs` `TEACHING_PACKAGES`, using `package_`
- `admin-src/src/teaching.ts` `PUBLISHED_LESSONS`

Leave `bestProgress_` and `upsertLessonProgress_` alone. Apps Script is still version 18 until Dalen publishes the same deployment. Do not click Deploy.

## Source

Hawaii Lessons Drive folder `1BxyGrVek4RTItCgzA5J8faOiVRb2fUyg`. The inventory is `docs/designs/hokulani-lms-phase1/curriculum-inventory.md` in Dbrain. Use the current pack named in the catalog. Skip `[Revisions]/`.
