# Dashboard checklist

Tracks `DASHBOARD_EXECUTION_PLAN.md` tasks T1–T9. T8 and T9 below are the live deployment and the synthetic walkthrough, not helper tests.

- [x] T1 Command transport. Instructor mutations post `action: "command"` to the existing Web App URL. The access token stays in the JSON body. `mutation_status` uses the same mutation id.
- [x] T2 Results layout and ownership. Headerless Results stay positional. Full answers go in `AnswersJson`. A stored submission id is checked against the student, program, test, and phase before it is replayed.
- [x] T3 One locked batch. Launch, release, assignments, import, reset, archive, sheet init, and catalog seed go through that command. The instructor page no longer writes those tables with the Sheets API. The old Quiz Admin menu no longer writes.
- [x] T4 Phase and catalogs. PRE and POST are separate assignment and state identities. Blank phase stays SINGLE. Catalog seed records the 23 assessment ids and does not load the 17 unavailable banks.
- [x] T5 Program operations. Create, edit, duplicate, archive, roster import, release, and program-scoped reset use the command service. A successful banner is applied after the read-back. Enabling editing does not rename a program or write lesson-title notes.
- [x] T6 Student assigned work. Login still requires the username and password. The assigned-work list uses the server title and phase. A `program` / `test` / `phase` link is kept through login and does not skip it.
- [x] T7 Instructor reports. Missing work, follow-up drafts, item review, audit, Data Health, and CSV export stay in the dashboard. Item review can use the pinned key. CSV does not include that key.
- [x] T8 Same-deployment publish. Live deployment `AKfycbz3Acc6aICeaolVb1KaFiVG4HSMH83NkRWv-2YIcvrHdVAT8-E39uShWuJ25dqB37V9` is version 15 (2026-10-27 11:34 PM, description left as "dashboard command bridge"). It executes as the workbook owner, access Anyone. GET returns `{"ok":true,"service":"lesson-quiz","contract":"dashboard-t9"}`. The same deployment ID and `/exec` URL were kept. Version 14 was the first command-bridge snapshot. `Dashboard.html` on the live project was not replaced. The default Apps Script project `343217199417` has the Sheets advanced service enabled, and `script.external_request` is authorized. Version 15 expands the sheet grid in the same batch when a write needs columns past the current grid.
- [x] T9 Synthetic walkthrough on the live workbook, 2026-10-28. Two programs in Post Test Master: `walk-a` (SCI-CS PRE closed, max 2, no timer; SCI-CS POST open, max 1, no timer; students walkada and walkbee) and `walk-b` (SCI-SOIL SINGLE, legacy UNSET, max 3, timer 300s; student walkada only). An existing walkada PRE attempt was submitted after that release was closed. Replaying its submission id did not add a result. The same id was rejected for walk-b, for POST, and for walkbee. Instructor Results shows one row: walkada, Computer Science — Science Lesson 3 (PRE), 3/5, 2026-10-28T09:34:53.429Z, 1 complete sit, cycle 1. Missing work: walkbee is missing PRE and POST; walkada is missing POST only. The follow-up draft uses "Please complete these assessments this week." and links to `?program=walk-a&test=SCI-CS&phase=POST`. Resetting walkada SCI-CS PRE in walk-a returned "Reset verified" after refresh `2026-10-28T09:46:38.626Z`. The 3/5 row stayed. Walk B still has no result rows, the same SCI-SOIL release, and only walkada on the roster. In-page refresh kept the selected program and its records.

Local checks before publish: `npm test` and `npm run typecheck` on `cb472e2`. The published instructor bundle is `admin-v2/assets/index-DPtaIifJ.js` at `https://5ninefish.github.io/lesson-quiz/admin-v2/?v=cb472e2`.

Live service:

- Student page: `https://5ninefish.github.io/lesson-quiz/`
- Instructor page: `https://5ninefish.github.io/lesson-quiz/admin-v2/?v=cb472e2`
- Web App: `https://script.google.com/macros/s/AKfycbz3Acc6aICeaolVb1KaFiVG4HSMH83NkRWv-2YIcvrHdVAT8-E39uShWuJ25dqB37V9/exec`
- Deployment ID: `AKfycbz3Acc6aICeaolVb1KaFiVG4HSMH83NkRWv-2YIcvrHdVAT8-E39uShWuJ25dqB37V9`
- Workbook: Post Test Master `1wFjzB6PgjhZjHWBcgLLVOa1TtBvaEDqoV8PGFYoX3EI`

Rollback of the service: Manage deployments, edit this same deployment, choose version 13 (2026-09-22 9:23 PM, "Lesson Quizzes"). Restoring a version does not remove workbook rows. Version 14 is the command bridge before the grid expansion. Rollback of the instructor page that calls the command bridge is `git revert cb472e2`, which returns the client that writes with the Sheets API. Do not leave that client pointed at a command-bridge service, and do not leave the command-bridge client pointed at version 13. A failed student submit on version 15 can include a short Sheets error detail in the student-facing message.
