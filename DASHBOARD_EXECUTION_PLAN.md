# Hōkūlani dashboard and LMS execution plan

Date: 2026-10-27 (HST). Review target: the Sheets-based build accepted in this conversation, consolidated with the recovered full product requirements. Source baseline: lesson-quiz commit 663045f; Dbrain commit df4f19a. Status: engineering plan, not a deployed build or a claim that findings are fixed.

## Authority and fixed scope

This is the single execution contract for the next Grok build. The existing recovery document, PROGRAM_LAUNCHER_BUILD.md and V2_BUILD.md remain evidence, not competing instructions to reconcile while coding. Current user directions prevail over historical exclusions. Supabase/Worker/D1 migration proposals are closed and must not be implemented.

- Existing repo: /Users/dalen/Public/clients/lesson-quiz; instructor app: admin-v2; student app: index.html and the existing Apps Script Web App.
- Existing private Post Test Master workbook is the runtime system of record. Keep logical Programs, ProgramStudents, ProgramTests and ProgramStudentState. Extend compatibly for lessons and PRE/POST; do not create another account bank, workbook per normal program, Web App, or database.
- Pages serves both portal interfaces; Apps Script serves data and coordinated mutations only. No instructor UI inside Apps Script. Keep the existing student service URL and deployment ID. Code updates publish a version to that deployment; no paste/delete/recreate workflow.
- Personal spend $0; no program funding assumed. No model API spend or paid upgrade is authorized here. All accounts remain prototypes. Do not weaken authentication, remove AI, or claim free hosting establishes free AI inference.
- Students are grades 9-12. The core is autonomous; optional Zoom sessions provide staff support using the same assignments and progress records. Keep this one product, not separate live and autonomous systems.
- Complete the instructor operations and student dashboard first. Lesson content/video authoring is paused. Reconnect existing CS only after the operator flow works; user acceptance precedes resuming lesson authoring.
- Full subsequent scope: five science lessons (CS, Health, Astronomy, Soil, Sustainability), then Mentoring 7, College Transition 9 including AI workshop, Internship and TEAMS Mindset. Digital Media lab remains separate and accessible; its assessment stays available. Coral keeps its identity. The under-one-month goal is a target, not a measured delivery estimate.

Scope record: feature list retained; original application/module arrangement retained. No feature cut, framework rewrite, new runtime, or unrelated TODO is proposed. More than eight files will change, but they remain in existing frontend/backend/report modules with one API adapter and existing test tools. Necessary implementation and regression proof of the stated contracts are included in the planning request; no product code is authorized or changed by this review. Estimated effort ranges below describe implementation, not review latency or a promised completion date.

## Current evidence and reuse

The current source includes newer commits 6fe809f and 663045f. Launch/archive/import/reset now have real save paths and assignment edits create missing state pairs. Do not implement the old finding that they are all preview-only. Keep the existing wizard, roster import preview, search, permissions UI, reports, countdown display, email compose and instructor help. Finish their persistence boundaries.

Observed live workbook headers: Programs A:I, ProgramStudents A:E, ProgramTests A:K, ProgramStudentState A:G, Students Username/Email/Password plus L1-L6 caches/cycles. Attempts currently has 11 headers, with no ProgramId header in the inspected range. Results row 1 is data in A:J and has Cycle/LifetimeSeq/SubmissionId/Status/Complete labels in T:X. Header inspection was read-only; student values and keys are not reproduced.

Existing tests: npm test passed 49 tests across programs.test.ts (21), parsers.test.ts (12), shell.test.ts (16); npm run typecheck passed. Vitest includes admin-src/**/*.test.ts. This is frontend/helper evidence, not a live Apps Script integration pass.

Bounded isolated probes ran the current Code.gs functions with synthetic in-memory storage only. finalizeAttempt_ against the real observed header shape wrote only T:X, leaving identity/score/answers blank. submit reached a stored-result replay before ownership checks when supplied a foreign result ID. No Google writes, real login, credential access, or deployment occurred. Deployed Apps Script source/version equivalence was not established.

## Architecture and write ownership

[Layer 1] Keep read-only instructor Sheets API access using current Google OAuth and workbook permissions. Keep the student UI on Pages.

[Layer 1] Route all operational mutations through domain commands in the existing Apps Script service: program launch/config/archive, roster import, memberships/assignments, release changes, reset, catalog import and student attempt operations. A client sends intent and stable IDs, never arbitrary cell ranges, actor email, grading result or a trusted checks_passed flag. Existing TS planners may preview changes; the server rereads and validates authoritative data.

The same ScriptLock guards current-state read -> validation -> commit for every cooperating application writer, including legacy menu handlers retained for operations. Locking is not a transaction and does not stop direct human edits or independent Sheets API writers. Remove active direct browser write paths for operational tables; do not claim spreadsheet editors cannot bypass the app. Data Health detects out-of-band edits. Automatic notes/rename side effects must not run when enabling editing.

Use one Sheets spreadsheets.batchUpdate call for each bounded logical mutation, combining AppendCells/UpdateCells requests across tables and its audit/deduplication record. Google documents atomic application of batch subrequests. This is an existing platform capability, not a new database. Verify the Advanced Sheets service or equivalent authorized REST transport during setup. Do not substitute a sequence of appendRow/setValue calls and label it atomic.

Each command has a client-generated MutationId, canonical target keys and expected current values/revision. Under the lock, recheck authorization and state, reject stale changes, return the already-committed result for a scoped replay, and commit data plus audit identity in the same batch. On timeout, query mutation status using the same identity before retry; do not mint another ID. Large imports are bounded and explicitly chunked with per-chunk IDs, resumable progress, and no all-or-nothing claim across chunks. If a large launch requires chunks, create it as non-student-visible DRAFT, persist resumable chunk identities, then activate only after the full manifest verifies. A crash leaves a resumable DRAFT, never a partially configured ACTIVE program. Student reads must exclude DRAFT, not merely ARCHIVED. Bulk edits to an existing program use bounded per-membership/assignment commits with explicit progress/partial-outcome reporting, rather than claiming whole-wizard atomicity across requests. Secrets never appear in audit detail or logs.

A failed precondition writes nothing. An invalid batch writes nothing. A lost response can mean committed: show Checking save and resolve by ID. A persisted-but-unverified outcome is not presented as success or as safe to repeat. Read back exact selected identities, phase/order/policy values and state pairs; matching counts alone is insufficient. Preserve visible error messages instead of refreshLive overwriting them.

```
Pages instructor                         Pages student
  Google sign-in                           Username + password
  read-only workbook snapshot              program picker / work list
            \\                              /
             existing Apps Script service
             authorize -> ScriptLock -> reread scope
               -> validate expected state / dedupe
               -> one atomic Sheets batch + Audit
               -> exact read-back / safe response
                            |
       shared workbook: programs / memberships / assignments
             Attempts + Results ledger / repairable caches
```

## Authentication and transport contract

The current admin client obtains an OAuth access token; Code.gs dashPost_ expects an ID token. These are different token types. Do not pass getAccessToken() as idToken or trust a client-supplied actor.

Preserve the current OAuth flow and use its access token for the new instructor command adapter. Treat the access token as delegated permission to Google APIs, not as an ID token or a locally decoded identity assertion. Use that same token with Google's documented userinfo endpoint to obtain the verified actor, then with Drive to check capabilities.canEdit/canModifyContent on the exact bound workbook (Shared Drive aware). Apply the batch with that caller token so Google also enforces the caller's scopes and current permission at commit. Reject missing/invalid identity, expired tokens, insufficient scopes and denied capability; never fall back to the owner's write authority on failure. Audit the server-derived identity. Workbook ACL remains the staff authorization baseline: staff who can read the workbook can read all its programs; the selected program is an operational scope, not a confidentiality boundary. This route does not claim to prove OAuth client audience from userinfo. Legacy ID-token endpoints require actual signature/issuer/audience/expiry verification if retained; retire or route them through the same command service so they cannot remain alternate writers. Do not implement an unsupported tokeninfo-in-production shortcut or invent an access-token JWT format.

Prove a real authenticated Pages -> existing Apps Script -> Sheets round trip at the start of implementation, including expired token, insufficient scopes, viewer, identity mismatch and denied workbook. Use the existing simple POST transport pattern supported by ContentService redirects; do not introduce untested CORS preflight headers. Do not put bearer tokens in URLs, exports, source control or logs. No new student account or password migration in this pass.

## Workbook contract and additive schema

Never insert a header row over legacy Results data, reorder existing columns, rewrite historical records, infer identities from row number, or run setup()/populateQuestions(). Detect duplicates of normalized keys before writes. Bad/missing schema is a visible error, not automatic destructive repair from student login.

Existing table keys stay: Programs(ProgramId), ProgramStudents(ProgramId,Username), ProgramTests(ProgramId,TestId), ProgramStudentState(ProgramId,Username,TestId). Add phase compatibly: blank existing phase means SINGLE, never silently PRE or POST. New assignment/state keys include Phase. Stable ProgramIds are immutable even after archive/rename.

Add these metadata tables in this workbook, not a second schema/store:
- TestCatalog: TestId, Title, Strand, QuestionGroup, Aliases, Version, Status. Catalog drives IDs/titles and resolves old L1-L6 aliases; existing format questions remain in Questions. DRAFT/READY status depends on bank validation. Bootstrap metadata without importing or rewriting questions/keys.
- LessonCatalog: LessonId, Title, Version, URL, Status. Lessons and tests are distinct records; published package metadata is sufficient, no new authoring CMS.
- ProgramLessons: ProgramId, LessonId, Enabled, SortOrder, LessonVersion, OpenAt, CloseAt, UpdatedAtHST, UpdatedBy. Enabling a test does not publish a lesson. Draft/unconnected content is labeled honestly.

Append Phase, LessonId, AssessmentVersion to ProgramTests; Phase to ProgramStudentState; ensure ProgramId is safely present at Attempts L before appending Phase and AssessmentVersion. Check that the target append column is vacant; never overwrite unknown fields. Expand every reader/range/URL/type/key/report together. Existing clients that omit phase retain SINGLE behavior until retired.

Results: implement one shared headered/legacy schema adapter for reader, writer, replay and cache repair. In the observed legacy layout preserve A Timestamp, B Username, C TestId, D lifetime attempt, E score, F onward answers up to the legacy capacity; preserve T:X metadata labels. Store full variable-length responses in an appended AnswersJson field so more than five items do not truncate. Append ProgramId, Phase, AnswersJson, QuestionCount and AssessmentVersion via detected metadata columns, not an assumed fixed next column. For more than the legacy answer capacity, leave legacy answer slots bounded and use AnswersJson as the authoritative response representation. Parse legacy row 1 as data. New Results must contain identity, score, full responses and ownership metadata. Attribution uses explicit ProgramId first, then a valid SubmissionId join, then labeled legacy-default attribution under the existing contract; conflicting/ambiguous joins are quarantined, not invented.

Audit keeps A:D and appends MutationId, ProgramId, TargetKey and the canonical nonsecret mutation/result details needed for retry. Human-readable changes include actor, time and scope. It is an operation ledger in the same workbook, not an external event platform. Do not log roster passwords or question keys.

Store explicit timestamp offsets/UTC instants; display/edit HST. A blank date stays blank. OPEN/CLOSED override schedules; AUTO without OpenAt is hidden; existing UNSET remains legacy-open. Invalid windows, fractional/negative tries, invalid timers and alias/canonical duplicate assignments are rejected by the server.

## Student attempt state and result rules

Server identity tuple: Username + ProgramId + TestId + Phase + Cycle + SubmissionId. Validate it before reading/replaying any result, before changing an attempt, and on every resume/submit. A result ID alone proves nothing. Cross-student/program/test/phase requests are denied without changing records.

On start under the shared lock: reread program ACTIVE, membership active, assignment enabled, phase/prerequisite, release and current cycle; resume the one matching valid in-flight attempt, otherwise enforce tries and mint once. Pin questions, key/version, timer, max tries and server start/deadline. Closing a release stops new starts but does not expire a valid existing attempt. Explicit reset invalidates the selected old cycle's active attempt. Membership revocation/archive blocks access; preserve work and history.

On submit: check owner and pinned context first, validate question IDs and allowed choices, use pinned key and server time, then commit one Results row plus terminal attempt status and cache updates atomically. An idempotent retry returns the scoped stored outcome and never grades again. Expired/partial work is retained with an explicit status; incomplete is not a failing complete score. Preserve the established 30-second timer grace as transport allowance, not extra advertised student time. Complete requires every required response; students receive completion/status only, never scores, official keys or correctness snapshots.

Reset increases only the chosen program/student/test/phase cycle and resolves that cycle's current attempt under the same lock. Retain all historical results. The ALL option is all selected-program assessments for one student, with explicit confirmation; no whole-roster reset. Cache failure must not lead to a second result or another allowed sit: Results/Attempts are authoritative and caches are repairable.

PRE and POST are separate obligations referencing the same approved question version when appropriate. Neither consumes the other's tries or fulfills its completion. Existing standalone tests remain SINGLE and do not require a completed autonomous lesson.

## Required product checklist

| Area | Delivery requirements |
|---|---|
| Instructor shell | Programs, Overview, Roster, Releases, Attempts, Results, Missing work, Data Health; selected program visible; signed-in account, read/edit status, refresh time, last-good snapshot, persistent search/pagination, keyboard/iPad use, help/cheat sheet. |
| Programs | List counts/state/links; five-step create; stable ID/name/dates; DRAFT/ACTIVE/ARCHIVED; configure, duplicate configuration without results, archive with history, switch, reopen saved configuration. Launch cannot expose a half-created ACTIVE program. |
| Roster | Global bank and selected-program members; separate Username/Email; multiple memberships; add/import CSV or paste with accepted/duplicate/rejected preview; append only validated new accounts; preserve credentials; assignment links distinct from assignment editor; safe filtered export. |
| Catalog/assignments | Shared lesson/test selection, enable/disable and ordering per program; explicit lesson availability and PRE/POST/SINGLE associations; initialize missing state pairs without resetting existing cycles. Show draft/unavailable banks honestly. Preserve all 23 defined assessment IDs; do not load the 17 non-science banks without user selection. |
| Releases | Open/close, schedule HST windows, MaxTries, minutes-to-seconds timer, edit metadata; exact save verification; enforce on student backend. No invented due dates or changed existing defaults. |
| Attempts | Program/student/test/phase/cycle/status/date filters; server-owned resume/countdown/expiry; No time limit state; single/all-for-one-student reset; retained history. Keep raw submission IDs out of primary table. |
| Results | Highest complete x/x, date, completed-sit count and cycle detail; actual historical sit review using pinned questions/key; PRE/POST comparison; partial separate; filtered exports. No duplicate standalone Best scores page. |
| Follow-up | Active membership x enabled required assignments minus complete same-context work; distinguish upcoming/closed from actionable missing; direct program/test/phase student links; editable recipient/subject/body; copy and email draft, no auto-send; exact sentence: Please complete these assessments this week. |
| Operations | Data Health for duplicate IDs/aliases, schema/date/key-length/unknown bank/orphan/join issues and missing state pairs; ignore initialized blank rows; audit, source and permission errors, allowed exports, non-destructive backup and recovery. |
| Student portal | Login lands on assigned work, not automatically PRE; auto-select one membership, picker for several, no-program state; human program/lesson/test titles and statuses; direct-link context survives login; navigation back home; resume current server attempt. Lesson progress is shown only when connected, not fabricated from test submissions. |

## Later lesson/AI integration boundary

This review includes the full product model so lesson integration does not trigger another platform redesign. It does not resume lesson writing. After the dashboard/student operator flow is accepted, add versioned LessonProgress/ActivityEvidence/SupportFlags records in this same workbook using the same identity and write service. Bounded drafts save on meaningful changes/debounce, not each keystroke. Record participation, checked practice outcome, supported continuation and assessment completion separately. Preserve the old lesson's progress bar/topic tabs/checkmarks while improving content.

Conversational AI remains required in CS, with authored hints as outage fallback. It cannot grade official tests or authorize completion. Keep official assessment keys out of context. Establish a viable $0 provider/usage route and measure quotas, latency, tokens and request/write counts before enabling tutor traffic; no specific provider's free availability is established by this review. No silent paid calls, second store, unbounded transcripts, or replacement of required AI with a hint-only claim. Reuse an already-authorized provider only after verifying the actual execution path and budget. Media stays outside spreadsheet cells. Later feature acceptance includes a real learner usability/tutor evaluation, distinct from synthetic policy tests and grant outcome claims.

## Build order and implementation tasks

Sequential work in shared Code.gs and main.ts; no worktrees or parallel writers are needed for this pass. Independent read-only evidence gathering does not authorize parallel code changes.

- T1 (P1; human 4-8h / AI-assisted 1-3h estimate): Establish same-service authenticated instructor command transport and shared writer. Files: Code.gs, admin-src/src/auth/google-token.ts, proposed google/backend-client.ts, config.ts, index.html config. First prove editor/viewer/expired-token round trip. Depends: none.
- T2 (P1; human 4-8h / AI-assisted 1-3h): Build the common Results layout adapter and owner-first attempt/replay rules. Files: Code.gs, workbook/results.ts, attempts.ts, programs/attribution.ts, reports/item-review.ts. Protect headerless row 1 and full variable-length responses. Depends: T1's writer contract; isolated regressions can be prepared first.
- T3 (P1; human 4-8h / AI-assisted 1-3h): Implement lock-scoped atomic batch, mutation identity/status and exact read-back; route existing operational callbacks through it. Files: Code.gs, main.ts, google/backend-client.ts; retire direct operational batch-write calls. Depends: T1,T2.
- T4 (P1; human 4-8h / AI-assisted 1-3h): Extend the existing workbook compatibly for data-driven catalogs, lesson assignment and phases; update parsers/types/read ranges/links. Files: Code.gs, ids.ts, config.ts, types.ts, workbook/, programs/. Seed metadata only with bank validation. Depends: T2,T3.
- T5 (P1; human 4-8h / AI-assisted 1-3h): Finish programs/roster/releases/import/duplicate/archive/reset and safe retry UX using current modules. Remove refresh-overwrites and edit-enable side effects; verify exact saved selections/settings, not counts. Files: main.ts, programs/, ui/, google/lesson-notes.ts. Depends: T3,T4.
- T6 (P1; human 3-6h / AI-assisted 1-2h): Finish assigned-work student home, program selection, phase-aware deep links, start/resume/expiry/submit and history isolation. Files: index.html, Code.gs. Depends: T2,T4,T5.
- T7 (P1; human 3-6h / AI-assisted 1-2h): Finish reports, highest-sit review, missing work, follow-up drafts, audit, exports and health against identical scopes. Files: reports/, missing/, programs/summaries.ts, workbook/, ui/shell.ts. Depends: T4-T6.
- T8 (P1; human 3-6h / AI-assisted 1-2h plus Google authorization/operator time): Establish clasp mapping from the actual current ScriptId/deployment, compare remote source before push, preserve remote differences, publish one reviewed backend version to the same deployment and record rollback. Build/commit Pages assets using existing main/root publishing. Verify service marker/version and stable URL; never treat repository HEAD as live backend evidence. Files: proposed deployment helper, SETUP.md, .github/workflows/ci.yml only if necessary. No credentials in git. Depends: T1-T7 passing local checks. Authorized account interaction is a concrete setup step, not a presumed missing credential.
- T9 (P1; human 3-6h / AI-assisted 1-2h plus observation): Run the integrated synthetic two-program acceptance once, fix failures, rerun affected checks, record results and handoff. Existing Vitest plus proposed backend-contract tests and actual browser journey. Depends: T8. No lesson content edits.

The dependency chain is T1 -> T2 -> T3 -> T4 -> T5 -> T6 -> T7 -> T8 -> T9; tests are added with each feature. Immediate acceptance stops at T9. Later lesson/AI activation is the preserved roadmap above, not another stack review. Estimates are rough work ranges, not additive calendar promises. Google access, observed failures and deployment conditions can dominate elapsed time. These tasks implement required behavior; they are not invitations to another general review sequence.

## Test review and coverage diagram

```
CURRENT SOURCE / PROPOSED PATH                 USER JOURNEY / COVERAGE
catalog/alias parsing ---- [tested helpers]    add new valid-format test [GAP ->E2E]
program wizard planning - [tested helpers]    launch/reopen/duplicate/archive [GAP ->E2E]
assignment/reset planners [tested helpers]    shared student, isolated reset [GAP ->E2E]
Google auth + command API  [GAP]               editor/viewer/expired token [GAP ->E2E]
lock + atomic batch       [GAP]               concurrent launch/reset/submit [GAP ->E2E]
mutation replay/status    [GAP]               lost response, same-ID retry [GAP ->E2E]
Results parse legacy      [tested helpers]    legacy -> backend submit -> report [GAP ->E2E]
Results writer/replay     [probe found bug]    owner/phase mismatch denied [GAP ->E2E]
student attempt state     [GAP in suite]       login/home/start/resume/expiry [GAP ->E2E]
report/email/screen       [tested helpers/UI]  exact link, draft/copy/no send [GAP ->E2E]
later tutor boundary      [planned later]     context/key/failure/help [later ->EVAL]
```

These are ten dashboard contract families, not a line-coverage percentage. Existing helper/UI coverage does not satisfy any live integration family by itself. Preserve the 49 existing tests. Add current Code.gs execution tests using Node VM inside existing Vitest, with synthetic Sheets/lock mocks, plus transport tests for the new client. No new test framework is needed. Proposed paths are not marked implemented.

Required assertions: headerless first result preserved; backend appends parseable identity/score/full answers; >5 and >14 item records retain all answers; a foreign SubmissionId cannot replay or mutate; same-ID retry produces one result/audit operation; snapshot grade/time survives later question/policy edits; close does not kill an in-flight attempt; reset invalidates only selected cycle; PRE and POST do not cross-satisfy; duplicate/alias/schema/invalid choice rejected; failed batch no partial launch; lost reply resolves committed outcome without duplicate; viewer/expired/insufficient-scope denied; exact values checked after write; current tests/search/right-wrong/email behavior retained.

Browser proof: create programs A and B with differing lesson/test sets and release windows, enroll one student in both, open one test and schedule another, set a short timer/tries, login to assigned work, resume on refresh/relogin, submit/expire, inspect results and missing work, reset A only, confirm B/history intact, compose/copy correct links, duplicate/archive, refresh saved settings. Include client disconnect/lost reply and stale-tab attempts. Use synthetic records only and record explicit outcomes/screenshots; no automatic emails.

## Failure modes and performance

Auth mismatch/expiry: deny with sign-in recovery, no writes; test first. Busy lock: visible busy, no new mutation ID; retry same intent. Validation/permission error: no write and actionable error. Invalid atomic batch: no partial state; test with failing subrequest. Lost commit response: status lookup under same ID, do not repeat append. Out-of-band manual edit: reread expected values, flag conflict/health; not covered by ScriptLock. Legacy layout mismatch: block writes until compatible adapter, preserve data. Missing bank/key: unavailable, no invented key or empty attempt. Catalog/version change: pinned existing attempt; new starts use newly published version. Partial/expired test: preserve status and full responses, never label as complete if answers missing. Report refresh failure: show stale/last-good state, preserve mutation warning.

Currently 4 critical gap families are observed in reviewed code: competing direct operational writes; legacy Results writer shape; replay ownership; read-back/partial-write false-success paths. Other required fixes are mapped below. No live corruption/exploit is claimed. All receive planned error handling and tests above; none is cleared by this planning review.

Keep lock sections short: bounded table reads once per command, batch writes once, Google token validation before lock, then recheck relevant state under lock. Avoid per-state-row network calls and full sheet reload per keystroke. Build per-snapshot lookup maps for normalized keys. Refresh manually/while visible at a conservative interval; no high-frequency polling. Cache only safe published catalog data; never cache stale authorization/release/attempt decisions as authority. Measure the original fixture targets (1,000 students, 25 programs, 25,000 results) as a bounded implementation check; they are not a capacity promise. Lesson draft/tutor traffic measurement belongs to later activation and cannot be used to justify a second store now.

## Deployment, recovery and not in scope

Record existing remote source/version, deployment ID and Pages baseline before backend work. Automated publishing must refuse a different deployment ID and preserve source changes not in the repository. Update existing versioned deployment after tests; restore prior backend version when appropriate while retaining new workbook records. Schema additions must remain readable by the rollback version or disable affected starts during recovery; restoring code does not reverse data. Export privately before schema changes and practice a non-destructive restore on synthetic data. Keep public bundles free of student data, passwords, keys and privileged tokens. Do not run public question-data exports as a shortcut.

Not in this pass: backend migration; custom-domain/DNS switch; new account/password scheme; new frontend framework; real student rollout; assessment re-authoring (CS July 24 image Q4 stays); loading the 17 undefined-in-live-bank assessments; lesson/media authoring; paid AI; unrelated Dbrain TODOs. These retain their existing dispositions. No new unrelated TODO is proposed. Full later curriculum and required AI remain on the roadmap, with the explicit activation work above.

## Engineering review findings and dispositions

All findings below concern the reviewed source or a proposed integration, not proof of a deployed exploit or data loss. The remedies are incorporated in the implementation tasks; product code was not edited. Native reviewer: Codex. Each source path is relative to /Users/dalen/Public/clients/lesson-quiz unless absolute.

### Architecture review: 6 findings

1. **F1 [P1] (confidence 10/10): competing writers and partial commits.** main.ts:313 calls `await appendRows(tab, grouped.get(tab) || [])`; google/batch-write.ts:30 calls the Sheets API directly. Code.gs:1274 uses `LockService.getScriptLock()`. The browser writer does not acquire that lock; sequential appends can stop after an ACTIVE program row exists. **Disposition:** T1/T3 coordinate all operational commands under the same service and use one atomic batch per bounded commit. Large launch chunks remain invisible DRAFT until verified activation. This is required consistency work, not a new runtime.
2. **F2 [P1] (confidence 10/10): the proposed command bridge cannot reuse the wrong token type.** auth/google-token.ts:77 stores `resp.access_token`; Code.gs:226 reads `body && body.idToken`, and :209 uses `tokeninfo?id_token=`. These interfaces do not match. **Disposition:** T1 implements explicit delegated Google API authorization using the same caller token for verified userinfo, workbook capability and commit; no fake ID token, guessed domain allowlist, unverified actor or fallback to owner authority. Existing ID-token/legacy writer paths must be coordinated or retired. End-to-end transport is the first implementation proof. This review did not exercise an authenticated command.
3. **F3 [P1] (confidence 10/10): the Results writer does not support the observed workbook shape.** Code.gs:1151 reads row 1 as `headers`; :1162 writes a field only when `idx >= 0`; :1178 appends that row. The live first row contains data in A:J, with only T:X labels. The isolated current-function probe wrote columns 20-24 only. Code.gs:1147 also loops `q <= 5`. **Disposition:** T2 uses an explicit shared layout adapter, preserves row 1, writes identity/score/response fields correctly, and stores full variable-length AnswersJson. This blocks real attempt writing until fixed and tested.
4. **F4 [P1] (confidence 10/10): stored result replay occurs before ownership validation.** Code.gs:558 obtains `findResultsBySubmissionId_(ss, clientSubmissionId)` and :561 returns it; the owner checks appear later at :578. The lookup at :1224 does not return owner/program fields. An isolated submit control-flow probe reached the replay path with a foreign result ID. **Disposition:** T2 checks the complete owner/context tuple before any replay or mutation and tests cross-student/program/test/phase attempts. No score leak or live exploit is claimed by this probe.
5. **F5 [P1] (confidence 9/10): the current model cannot distinguish PRE and POST or publish a data-driven lesson catalog.** config.ts PROGRAM_HEADERS keys only ProgramId/TestId; programs/assignment-save.ts:18 returns `${programId}\t${username}\t${testId}`. launcher.ts:75 requires `TEST_IDS.includes(t.testId)`. Live ProgramTests/ProgramStudentState headers confirm no phase. **Disposition:** T4 appends phase metadata and introduces catalog/ProgramLessons metadata in the same workbook; update every key, parser, URL, state lookup and report together. Preserve legacy SINGLE records and aliases. This implements existing product requirements; do not load unselected question banks.
6. **F6 [P1] (confidence 10/10): release close currently invalidates started work.** Code.gs:501-504 finalizes a nonexpired attempt when `closed`; :593-594 rejects a nonexpired submission after closure. **Disposition:** T2/T6 enforce release eligibility for new starts and preserve pinned policy for a valid existing attempt. Explicit reset/revocation/archive have their documented separate scope. Add the close-mid-attempt regression.

### Code quality review: 3 findings

7. **F7 [P1] (confidence 10/10): count-based verification and refresh can conceal incomplete saves.** main.ts:702-704 compares only member/test counts; launcher.ts:193-200 checks presence/counts. main.ts:777 replaces the banner during refresh, including preceding mutation warnings. **Disposition:** T3/T5 compare exact identities, phases, order, policy and state pairs; preserve the mutation outcome banner; provide scoped operation status after uncertain writes. Matching counts do not establish a correct save.
8. **F8 [P2] (confidence 9/10): validation and lifecycle checks need one authoritative boundary.** launcher.ts:77 checks only `t.maxTries > 0` although the message says positive integer. Code.gs:289 excludes ARCHIVED in membership resolution but does not exclude DRAFT. Code.gs:664 treats any nonempty answer as filled; grade_ at :882-883 only compares it with the key. **Disposition:** T3-T6 validate server-side IDs, statuses, integers, dates, question IDs and choice sets. DRAFT must not expose assignments. Blank expired responses remain a permitted partial submission, distinct from complete work. Frontend previews are convenience, not authority.
9. **F9 [P2] (confidence 10/10): historical item review uses the current question bank.** ui/shell.ts:557-559 calls `reviewSit(snap.questions.filter(...), r.answers)`; reports/item-review.ts:30 uses current `q.keyLetter`. Editing a question/key can change the displayed right/wrong interpretation of a historical sit. **Disposition:** T2/T7 join the actual attempt snapshot/version for review; label unmatched legacy review provenance instead of claiming historical accuracy from current keys. Keep the working score-click UI.

### Test review: 1 finding, 10 integration contract families

10. **F10 [P1] (confidence 10/10): passing helper/UI tests do not cover the mutation service.** vitest.config.ts:5 includes `admin-src/**/*.test.ts`; the three inspected test files cover helpers and DOM rendering. The 49 tests pass, but no result in that suite proves a real Pages -> Apps Script -> workbook operation, shared lock, timer, replay or same-deployment update. **Disposition:** preserve those tests and add Code.gs contract execution tests plus the ten integrated user-flow families in the diagram. Do not build the proposed suites as part of this review. Tests required by T1-T9 accompany implementation, followed by one actual synthetic walkthrough. No invented line-coverage percentage.

### Performance review: 1 finding

11. **F11 [P2] (confidence 9/10): repeated table scans and per-row requests need bounded execution.** Code.gs:1051/1068/1200 independently call `getDataRange().getValues()`; main.ts:493 onward reads each state row separately during reset. The source demonstrates repeated I/O, not a measured quota or latency failure. **Disposition:** T3/T5 cache a request-local snapshot/map, batch reads/writes, keep lock occupancy short, and measure the original fixture sizes before claiming scale. No speculative migration or new cache service.

## Decision ledger and scope readiness

| Record | Baseline / source | Review disposition | Implementation permission |
|---|---|---|---|
| R1 Runtime and cost | Current conversation fixes Sheets + existing Pages + same Apps Script deployment; Dalen explicitly confirms $0 and no program funding. | Retained. Migration proposals closed. No new architecture choice asked. | No paid service, account change or migration authorized. |
| R2 Product scope | Recovered instructor requirements, separate assigned-work student portal, full later LMS/AI scope; Dalen says run the consolidated review now. | Retained without feature cuts. | Review produces the execution plan; it does not change live data. |
| R3 Structure | Existing app is the foundation; no replacement dashboard/framework. | Retain current modules, one command adapter, existing test tools. Complexity threshold noted; no alternative product/structure selected or extra service introduced. | Routine plan structure resolved within the requested consolidation. |
| R4 Correctness remedies | Existing requirements require program isolation, reliable saves, preserved history, server policy and correct reports. | F1-F11 map necessary implementation/proof to T1-T9. No relaxed guarantee or optional extra review proposed. | Tasks are planned remedies, not completed fixes or authorization to deploy from this review. |
| R5 PRE/POST and lessons | User requires separate science PRE/POST and enabled lessons per program; lesson authoring paused. | Additive same-workbook metadata, legacy SINGLE semantics; instructional work stays paused. | No assessment re-authoring or question-bank loading. |
| R6 Later AI/budget | Conversational AI required; $0; traffic not in this dashboard pass. | Preserve explicit activation work and measurements. A $0 inference route is not yet demonstrated. | No paid calls or claimed tutor readiness. This later implementation dependency does not block dashboard work. |
| R7 Outside coverage | Standard skill second opinion enabled. | Claude invocation failed: `Failed to authenticate: OAuth session expired and could not be refreshed`. No reviewer text or model identity returned. Declared Plan/TaskOutput/TaskStop fallback interfaces are not supplied in this host, so no substitute reviewer was launched. | No sign-in, credential change, paid API workaround or clean-review credit. |

Approval readiness: PASS for the review's requested scope and inherited contracts (R1-R7). No unanswered product choice was converted into a runtime change. All new code remains proposed implementation. The user's existing direction to avoid more review rounds resolves navigation: hand off this execution plan for build, not another skill chain.

## Source research and scope limits

Official documentation read during this conversation:
- Google LockService: https://developers.google.com/apps-script/reference/lock/lock-service — lock is scoped to the script and participating code, not a Sheets-wide transaction.
- Sheets batch requests: https://developers.google.com/workspace/sheets/api/guides/batch — batch subrequests are atomic; multiple separate requests are not one transaction.
- Google OIDC: https://developers.google.com/identity/openid-connect/openid-connect — access-token userinfo and ID-token validation are distinct; tokeninfo is documented for debugging, not a production verifier shortcut.
- Drive file capabilities: https://developers.google.com/workspace/drive/api/reference/rest/v3/files — caller canEdit capability and additional content restrictions.
- Apps Script deployments: https://developers.google.com/apps-script/concepts/deployments — update the existing versioned deployment while retaining its ID/URL.
- Clasp: https://developers.google.com/apps-script/guides/clasp — local source management and existing-deployment updates; use installed help/version during implementation before scripting exact flags.
- Quotas: https://developers.google.com/apps-script/guides/services/quotas — measure actual workload; no quota failure established here.

Prior learning applied: hokulani-cs-harness-not-student-lesson, confidence 10/10. Successful API/helper tests do not establish a usable student screen. The older launcher-preview learning is superseded by the current commit's save paths. The older two-month context is superseded by Dalen's under-one-month target; neither is a measured estimate.

## Completion summary

- Step 0: scope accepted as-is; no feature cuts; existing module arrangement retained.
- Architecture: 6 findings. Code quality: 3. Tests: diagram produced; 10 integrated contract families require proof. Performance: 1 finding.
- Existing checks: 49/49 tests and typecheck pass. Two isolated current-function probes demonstrate the Results-layout and replay-control-flow defects.
- NOT in scope, existing/reused code, failure modes, task dependencies and deployment/recovery are documented.
- Critical gaps in current implementation: 4 families (F1/F3/F4/F7), all mapped to build tasks, none claimed fixed by this plan.
- TODO proposals: 0 unrelated additions. Existing deferred lesson/AI/content work remains explicit in this plan.
- Current-pass unresolved decisions: 0. Future provider/quota/learner validation remains uncompleted work, not a dashboard readiness claim.
- Outside voice: Claude Code unavailable, expired OAuth; no outside review completed, no fallback coverage claimed.
- Implementation: sequential, shared modules. Lake Score: N/A; no coverage-cut choice was requested or selected.
- Review status: DONE_WITH_CONCERNS. Planning is complete; P1 implementation work and its acceptance proof must finish before release. No further general plan-review round is prescribed.

## Suppressed findings and unknowns

No platform incapacity, credential absence, legal approval requirement, live exploit, student learning gain, $0 AI availability, measured concurrent capacity or deployed-backend source equivalence is claimed. These were not established by evidence. No low-confidence speculative code finding was promoted to the main list. Deployment/version and service transport are named implementation checks, not assumed blockers.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | Not requested | Product direction retained | 0 current | NOT RUN | No extra review required for this pass |
| Outside Review | Standard /plan-eng-review step; Claude Code | Independent challenge | 1 attempt | UNAVAILABLE | OAuth expired; no review text |
| Eng Review | /plan-eng-review | Consolidate architecture, state, tests and build order | 1 current | ISSUES OPEN (PLAN) | 11 findings mapped to 9 implementation tasks; 4 critical gap families; 0 current unresolved decisions |
| Design Review | Not requested | Existing UI preserved | 0 current | NOT RUN | No chained design review |
| DX Review | Not requested | Not this scope | 0 current | NOT RUN | No chained DX review |

**OUTSIDE COVERAGE:** Claude Code, plan-review phase, unavailable after authentication error; native fallback interfaces unavailable in this host. No independent completion credit.

**VERDICT:** Native engineering review complete; proceed with T1-T9 implementation. This is not release clearance: the current code still contains the mapped P1 findings. Validate the built operator journey rather than restarting general reviews.

NO UNRESOLVED DECISIONS
