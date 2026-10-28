# Dashboard checklist

Tracks `DASHBOARD_EXECUTION_PLAN.md` tasks T1–T9. This file records what the repository contains. It is not evidence that the live workbook or the live Apps Script deployment has been updated.

- [x] T1 Command transport. Instructor mutations post `action: "command"` to the existing Web App URL. The access token stays in the JSON body. `mutation_status` uses the same mutation id.
- [x] T2 Results layout and ownership. Headerless Results stay positional. Full answers go in `AnswersJson`. A stored submission id is checked against the student, program, test, and phase before it is replayed.
- [x] T3 One locked batch. Launch, release, assignments, import, reset, archive, sheet init, and catalog seed go through that command. The instructor page no longer writes those tables with the Sheets API. The old Quiz Admin menu no longer writes.
- [x] T4 Phase and catalogs. PRE and POST are separate assignment and state identities. Blank phase stays SINGLE. Catalog seed records the 23 assessment ids and does not load the 17 unavailable banks.
- [x] T5 Program operations. Create, edit, duplicate, archive, roster import, release, and program-scoped reset use the command service. A successful banner is applied after the read-back. Enabling editing does not rename a program or write lesson-title notes.
- [x] T6 Student assigned work. Login still requires the username and password. The assigned-work list uses the server title and phase. A `program` / `test` / `phase` link is kept through login and does not skip it.
- [x] T7 Instructor reports. Missing work, follow-up drafts, item review, audit, Data Health, and CSV export stay in the dashboard. Item review can use the pinned key. CSV does not include that key.
- [ ] T8 Same-deployment publish. Local checks passed. The bound project is open. Live deployment `AKfycbz3Acc6aICeaolVb1KaFiVG4HSMH83NkRWv-2YIcvrHdVAT8-E39uShWuJ25dqB37V9` is version 13 (2026-09-22 9:23 PM, description "Lesson Quizzes"), executed as the workbook owner. Rollback of the service is that version. `Dashboard.html` on the live project is not replaced.
- [ ] T9 Synthetic walkthrough on the live workbook. The in-memory contract test is not this walkthrough.

Local checks on this revision: `npm test` (50 tests) and `npm run typecheck`. The built instructor bundle is `admin-v2/assets/index-DPtaIifJ.js`. It is not the published Pages bundle until `main` is pushed.

Existing service, unchanged until T8:

- Student and instructor pages: `https://5ninefish.github.io/lesson-quiz/` and `https://5ninefish.github.io/lesson-quiz/admin-v2/`
- Web App: `https://script.google.com/macros/s/AKfycbz3Acc6aICeaolVb1KaFiVG4HSMH83NkRWv-2YIcvrHdVAT8-E39uShWuJ25dqB37V9/exec`
- Deployment ID: `AKfycbz3Acc6aICeaolVb1KaFiVG4HSMH83NkRWv-2YIcvrHdVAT8-E39uShWuJ25dqB37V9`
- Workbook: Post Test Master `1wFjzB6PgjhZjHWBcgLLVOa1TtBvaEDqoV8PGFYoX3EI`

Rollback of the published instructor page, before this bundle is pushed, remains `git revert 663045f`. The live Apps Script has no newer version to restore. After T8, record the previous deployment version here before publishing.
