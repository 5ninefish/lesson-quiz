# Pickup — student dashboard and Mentoring drafts — 2026-10-29 2200 HST

Read this file first in a new Grok session. It replaces `TRANSITION_2026-10-28.md` for what to do next. That older file still records the connected science lessons. The live portal is `/Users/dalen/Public/clients/lesson-quiz` (`github.com/5ninefish/lesson-quiz`). Shell cwd sticks in `/Users/dalen/Dbrain`. `cd /Users/dalen/Public/clients/lesson-quiz` before every git or node command. Do not commit dirty Dbrain. Do not treat `127.0.0.1:8765` as the portal.

Codex is the planner and reviewer. Grok is the builder. Do not restart a general review. Do not apply `/private/tmp/hokulani-assignment-fix` as a tree. Implement only what Dalen names.

## Live

- Student: `https://5ninefish.github.io/lesson-quiz/?v=5427aeb`
- Instructor: `https://5ninefish.github.io/lesson-quiz/admin-v2/`
- Instructor bundle: `admin-v2/assets/index-DZihucTh.js` and `admin-v2/assets/index-o1gZXpz2.css`
- Web App: `https://script.google.com/macros/s/AKfycbz3Acc6aICeaolVb1KaFiVG4HSMH83NkRWv-2YIcvrHdVAT8-E39uShWuJ25dqB37V9/exec`
- Deployment ID: `AKfycbz3Acc6aICeaolVb1KaFiVG4HSMH83NkRWv-2YIcvrHdVAT8-E39uShWuJ25dqB37V9`
- Script ID: `1Pdbx3MsjPp08-5ARNN-Q8n9GueijIhDqu3pNKmHep96M_muCZ4shxxAC`
- Workbook: Post Test Master `1wFjzB6PgjhZjHWBcgLLVOa1TtBvaEDqoV8PGFYoX3EI`
- Apps Script published version **18**, 2026-10-28 9:45 AM HST, description "keep lesson artifacts". GET returns `contract: dashboard-t9` and `teaching: v1`. Same deployment. `Dashboard.html` was not replaced.
- GitHub `main` at this pickup is `5427aeb`. Pages HTML cache is about 10 minutes. `?v=` only busts cache. It does not select a git commit.

Recovery: Manage deployments, edit this same deployment, choose version 16 or version 15. Do not choose version 17. A resume on version 17 can replace a finished topic's artifact. Version 13 is the pre-bridge service rollback and does not delete workbook rows. Do not create or archive a deployment. Do not paste commit `f16a56d` over the Apps Script project. Do not click Deploy. UH 2FA blocks that click. Dalen publishes the same deployment when he is ready.

## Model Dalen confirmed

A student has one cohort. In this schema the word program means cohort. Examples: Fall Interns, Spring Interns, Summer 1, Summer 2. Domains are assigned to a cohort. A cohort can include several domains. Students do not pick a cohort or a domain.

Domains on the student nav: Science, Mentoring, College Transition, Internship, Mindset. Science is one domain and contains Computer Science, Health, Astronomy, Soil, and Sustainability. Computer Science is not its own section.

`preview`, `teach-cs` ("Teaching Computer Science"), and `teach-field` ("Teaching Field Lessons") are not cohorts and not domains. The student dashboard must not say Teaching. Students are not teaching. Leave those ProgramStudents rows in place. Progress and results stay keyed by programId. The preview login is a normal student used to look at lessons. Two real cohorts still stop with the contact-instructor message. A requested id that is not a membership stays `not_in_program` and must not change the sheet. Client login sends `programId: ''`.

Sustainability stays UNLINKED. Do not map it to `SCI-CORAL`. `SCI-CORAL` stays the 3D printing bank.

## What the student page does on `5427aeb`

Sign-in heading is "Student dashboard". After a successful sign-in the page stores `hokulani-dashboard-session` (username and password, same tab) and `hokulani-dashboard-view` (the painted lesson list, no password). Logout clears both, plus `hokulani-lesson-session` and `quizSubmissionId`.

`loadAssignedWork` loads each membership the service lists, stamps `programId` onto lessons and tests, and merges them. Non-cohort names stay off the header. The header says Cohort only for a real cohort. Otherwise it says Hōkūlani. A lesson id starting with `ment-` is Mentoring. Other current lessons are Science.

Built catalog lessons the deployed script omits are added from `lessons/mentoring/catalog.json` when `built` is true. Those cards can be opened. Their note says saved checks start after the lesson is assigned to the cohort. `requirePre` is false on those local cards.

`lessons/runner.js` paints the first topic as soon as `content.json` loads. A failed `lesson_state` leaves the page and the back link in place. **Back to my lessons** uses browser history when the lesson was opened from the dashboard, so the already-open dashboard returns. A full reload hides the sign-in form before paint when `hokulani-dashboard-session` exists, restores `hokulani-dashboard-view`, and does not call `login()` when that snapshot is there. Lesson pages load `runner.js?v=stay-dash`.

Dalen had not confirmed this return yet when the pickup was written. If he says the sign-in form still appears, hard-refresh `?v=5427aeb`, sign in once on that page, open a lesson from that dashboard, then use Back to my lessons. Check the live `index.html` for `resume-dash` and `history.back` before changing the runner again.

## Source that is not on version 18

`Code.gs` and `LessonBridge.gs` on `main` are ahead of the published script. Until Dalen publishes this same deployment:

- Empty `programId` for preview still returns `needProgram` with programs `preview`, `teach-cs`, and `teach-field`, and zero lessons. A direct programId still works. The client fan-out depends on that.
- The service does not send `submitted`. The client treats a phase as finished only when `submitted === true`. A missing field does not lock the lesson button and does not count as finished.
- `ment-interviews@2026-10`, `ment-card-sort@2026-10`, and `ment-scientist@2026-10` are unknown packages. Enabling a sheet row does not make version 18 return them. A progress post for an unknown package fails. Do not submit quizzes to test the gate.

When published, these source rules apply: one active cohort, including a direct request; a complete sitting is the only assessment completion (`submitted === true`, never inferred from `state === 'done'` or `tries > 0`); a gated lesson needs a complete PRE; a blank program id on a complete PRE counts only for `hokulani`; standalone cards keep `submitted` the same way linked phase cards do. `ensureRuntimeSchema_` runs after credential and context checks. Only Status ACTIVE programs count.

## Lessons

Science pages, registered and already exercised on version 18: `sci-cs`, `sci-health`, `sci-astro`, `sci-soil`, `sci-sust` (unlinked).

Mentoring catalog `lessons/mentoring/catalog.json` is `status: "partial"`.

| Lesson | Id | Bank | Page |
|---|---|---|---|
| Interviews | `ment-interviews@2026-10` | MENT-INT | built, `682681b` |
| STEM Interests and Career Card Sort | `ment-card-sort@2026-10` | MENT-SORT | built, `a1b4ad2` |
| What a Scientist Does | `ment-scientist@2026-10` | MENT-SCI | built, `1ab7359` |
| Role Models | `ment-role-models@2026-10` | MENT-ROLE | not built |
| STEM Is All Around Us | `ment-around@2026-10` | MENT-AROUND | not built |
| STEM in Music | `ment-music@2026-10` | none | not built, stay unlinked |
| STEM in Sports | `ment-sports@2026-10` | none | not built, stay unlinked |

Register a finished lesson in `LessonBridge.gs` `TEACHING_PACKAGES` and `admin-src/src/teaching.ts` `PUBLISHED_LESSONS` only when its page can be opened. Interviews, the card sort, and What a Scientist Does are already registered in source. They are not enabled on preview, teach-cs, or teach-field. Do not enable them until Dalen publishes the package. Do not publish the four unbuilt lessons as empty cards. Do not invent banks for Music or Sports. Do not attach another lesson's bank. No answer keys in the browser.

Drive, already signed in as `dkahiapo@hawaii.edu`, account path u/1. Stay inside the opened Hawaii Lessons folder. `scripts/gdrive.sh` for that account returns `invalid_grant`. The Drive MCP cannot see these folders.

- Curriculum: `1BxyGrVek4RTItCgzA5J8faOiVRb2fUyg`
- Mentoring: `1v0BGp-Qr5ro6-CSaM3PhjFNqSSO5VAPx`
- Interviews: `13l7K84T4fQ3_NJJ0sQoC_Au2z9iqCNuV`
- Card sort: `1aAh58VHS5Ow5-BOp34NF_CKUAXBJEPQZ`
- What a Scientist Does: `1I-t6pe3aHt_yhTrnIs1zyO5b83nHUiku`

Skip `[Revisions]/`. Newest instructor plan wins. Read the student summary beside it. Official items stay off the page.

## Checks

From `admin-src`: `npm test` and `npx tsc --noEmit`. Last green run named in the prior session was 54 passed, before the Mentoring drafts and the back-button commits. `node --check` on `lessons/runner.js` and the inline scripts in `index.html` passed for `5427aeb`. `rg` is not installed. Do not loop `read_file` / `grep` across Dbrain. In lesson-quiz, read the file you are changing.

## Board

Project `61990b1f-2064-440f-a77d-b684823bffd4` stays in progress. Do not mark it done.

Still open, and out of scope unless Dalen asks:

- `89531c0b` — practice on the live Post Test Master from admin-v2. Do not run `setup()`. The sentence that says lessons stay paused is stale.
- `f1dab0d6` — add the 17 non-science post-tests only after their banks are chosen.

Also undone, and not implied by a new session: the teach-cs versus teach-field isolation write, and the nine live Data Health parse warnings. Read those messages before changing them. Do not invent the nine.

## Do not

Do not run `setup()`. Do not hash passwords. Do not print student passwords, answer keys, or which quiz choice is correct. Passwords stay on the Students sheet. Do not copy them into notes, commits, or chat. Do not delete ProgramStudents rows. Do not write `/Users/peakforge/`. Do not commit `.claude/` or `.env`. Do not amend. Git may warn that the committer was taken from the hostname. Leave that warning.

Browser work uses PeakForge Chrome on `127.0.0.1:9222`. Leave Interactive Brokers, Drive navigation beyond the folders above, the authuser 0 confirmidentifier tab, the Apps Script editor, and the Post Test Master sheet alone unless Dalen asks for that surface. Instructor Google account is `dkahiapo@hawaii.edu`.

## Prompt

Paste this into a fresh Grok session:

```
Pick up Hōkūlani lesson-quiz. Read /Users/dalen/Public/clients/lesson-quiz/TRANSITION_2026-10-29.md first and follow it. Repo is /Users/dalen/Public/clients/lesson-quiz on GitHub 5ninefish/lesson-quiz. cd there before every command. Dbrain cwd sticks.

GitHub main at the pickup is 5427aeb. Student page: https://5ninefish.github.io/lesson-quiz/?v=5427aeb. Apps Script version 18 is still the published deployment. Do not click Deploy, run setup(), print a password, delete ProgramStudents rows, or commit .claude/ or .env.

A student has one cohort. Program means cohort. Domains are Science, Mentoring, College Transition, Internship, and Mindset. Science includes Computer Science. preview, Teaching Computer Science, and Teaching Field Lessons are not cohorts. The student dashboard must not say Teaching.

Back to my lessons was just changed so it returns to the open dashboard and does not sign the student in again. Wait for Dalen to say whether that worked before changing navigation again.

Do not start a new lesson, a review, or a deploy on your own. Ask what he wants next, or do the one task he names in this message.
```
