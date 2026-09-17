# Hōkūlani Program Launcher and Instructor Operations — Build Specification

Status: **Execution specification for Grok Build**  
Repository: `/Users/dalen/Public/clients/lesson-quiz`  
Implementation baseline: commit `54f63fe`  
Date: 2026-09-16 (Pacific/Honolulu)  
Budget: **$0 personal spend**  
Production domain: `portal.projecthokulani.com`

## 1. Executive directive

Extend the existing zero-cost, Sheet-backed post-test portal into a multi-program system with one shared student bank, one shared test bank, and a dashboard-based Program Launcher.

An instructor must be able to:

1. create a program;
2. select students from the shared student bank;
3. select tests from the shared test bank;
4. configure program-specific release windows, attempts, and timers;
5. review the complete configuration;
6. click **Launch Program**; and
7. receive professional student and instructor URLs under `portal.projecthokulani.com`.

“Launch” means creating a logical program workspace in the Google Sheet. It does not mean creating another GitHub repository, GitHub Pages site, OAuth client, workbook, Apps Script project, or physical deployment.

The same student may participate in more than one program. The same test may be used by any number of programs. Attempts, resets, completion, and missing-test calculations must remain separate by program.

Also extend the instructor portal with:

- complete release controls currently available through the Sheet's **Quiz Admin** menu;
- program-aware missing-test reports;
- clickable test titles that open the correct student test;
- a student-email compose dialog with copy and draft actions; and
- no date in the generic message. The required sentence is: **“Please complete these assessments this week.”**

## 2. Fixed constraints

| Area | Requirement |
|---|---|
| Personal cost | $0. No paid hosting, database, VPS, or license. |
| Hosting | Existing GitHub Pages repository. |
| Public domain | `https://portal.projecthokulani.com`. |
| Data store | Existing Google Sheet. |
| Student accounts | One shared `Students` bank. Credentials are not copied per program. |
| Test bank | One shared `Questions` bank. Questions and answer keys are not copied per program. |
| Programs | Logical workspaces stored in program tables. |
| Instructor identity | UH Google account through Google Identity Services. |
| Instructor authorization | Workbook permissions; editors mutate, viewers read. |
| Student authentication | Existing username/password flow. |
| Student score visibility | Students never receive scores or answer keys. |
| Apps Script | One controlled program-aware backend deployment is allowed. Future program launches require no deployment. |
| Legacy data | Preserve it. Do not rewrite malformed `Results` rows. |
| Live setup | Never run `setup()` on the live workbook. |
| Program creation | Dashboard workflow with preview, confirmation, verification, and audit entry. |
| Physical copies | Not the default. Use only for a real ownership or data-isolation requirement. |

## 3. Current implementation baseline

Commit `54f63fe` provides a static TypeScript instructor portal with:

- Overview;
- Roster;
- Releases read view;
- Attempts;
- Results;
- Missing tests;
- Data Health;
- synthetic demo data;
- Google Sheets and Drive API read adapters;
- workbook parsers for known legacy shapes; and
- a committed static build at `/admin-v2/`.

Current limitations relevant to this build:

- `config.ts` hard-codes one Hōkūlani workbook and no program dimension;
- `missingTests()` compares every populated student with every global test;
- Missing Tests renders plain text rather than links or controls;
- Releases is a read-only table;
- the student page does not consume `program` or `test` URL parameters;
- attempts and results do not carry reliable program identity;
- the deployed Google OAuth client ID is still blank; and
- the Vite base is `/lesson-quiz/admin-v2/`, which must change for the custom domain.

## 4. Architecture decision

Use one code deployment and one workbook with multiple logical program workspaces.

```text
                         Shared Google Sheet
        +----------------------+----------------------+
        |                      |                      |
   Students bank          Questions bank         Program tables
        |                      |                      |
        +----------- Program Launcher ---------------+
                               |
                    +----------+----------+
                    |                     |
             Program students       Program tests
                    |                     |
                    +---- attempts/results ----+
                         tagged by ProgramId

Student URL:    portal.projecthokulani.com/?program=<slug>
Instructor URL: portal.projecthokulani.com/admin-v2/?program=<slug>
```

### 4.1 Why logical launches are preferred

A physical deployment per program would duplicate:

- source and build artifacts;
- Apps Script deployments;
- OAuth configuration;
- student accounts;
- question banks;
- answer-key maintenance;
- release logic; and
- troubleshooting surfaces.

Logical programs provide distinct rosters, test assignments, releases, attempts, and reports without creating drift.

### 4.2 When a physical deployment is justified

Create a separate workbook/application only when a program requires a different:

- institutional owner;
- workbook permission boundary;
- legal or contractual data boundary;
- domain or brand;
- operator group that must not see other programs; or
- lifecycle independent of the shared system.

That is an exception requiring a separate plan. The Program Launcher must not claim to automate physical Apps Script deployments.

## 5. Data model

Add four program tables. Do not duplicate `Students` or `Questions`.

### 5.1 `Programs`

| Column | Meaning | Rules |
|---|---|---|
| `ProgramId` | Immutable machine identifier | lowercase slug; unique; never reused |
| `ProgramName` | Instructor-facing name | required |
| `Status` | `DRAFT`, `ACTIVE`, or `ARCHIVED` | required |
| `StartAt` | Optional program start in HST | nullable |
| `EndAt` | Optional program end in HST | nullable |
| `CreatedAtHST` | Creation timestamp | immutable |
| `CreatedBy` | Instructor account | required when available |
| `UpdatedAtHST` | Last configuration change | required |
| `UpdatedBy` | Last editor | required when available |

`ProgramId` examples:

```text
hokulani
summer-2026
kapilina-fall-2026
```

Do not use a display name as a key. Renaming a program must not change existing URLs or historical attribution.

### 5.2 `ProgramStudents`

| Column | Meaning | Rules |
|---|---|---|
| `ProgramId` | Program reference | must exist and not be archived for new work |
| `Username` | Shared student reference | normalized lowercase; must exist in `Students` |
| `Active` | Membership state | boolean |
| `AssignedAtHST` | Assignment timestamp | required |
| `AssignedBy` | Instructor account | required when available |

Logical uniqueness: `(ProgramId, Username)`.

A student may belong to multiple programs. Deactivating membership does not delete attempts or results.

### 5.3 `ProgramTests`

| Column | Meaning | Rules |
|---|---|---|
| `ProgramId` | Program reference | required |
| `TestId` | Canonical shared test reference | one of the recognized `SCI-*` IDs |
| `Enabled` | Assigned to program | boolean |
| `SortOrder` | Student display order | positive integer |
| `Manual` | `UNSET`, `OPEN`, `CLOSED`, or `AUTO` | required |
| `OpenAt` | Scheduled open time in HST | nullable |
| `CloseAt` | Scheduled close time in HST | nullable |
| `MaxTries` | Attempts in the current cycle | positive integer; default 2 |
| `TimeLimitSec` | Server timer | nonnegative integer; default 0 |
| `UpdatedAtHST` | Last change | required |
| `UpdatedBy` | Last editor | required when available |

Logical uniqueness: `(ProgramId, TestId)`.

The test title, questions, choices, and correct answers remain in the shared question bank. `ProgramTests` contains assignment and operating policy only.

### 5.4 `ProgramStudentState`

| Column | Meaning | Rules |
|---|---|---|
| `ProgramId` | Program reference | required |
| `Username` | Student reference | required |
| `TestId` | Test reference | required |
| `Cycle` | Reset generation | positive integer; default 1 |
| `SitCache` | Current-cycle attempt cache | nonnegative integer; default 0 |
| `UpdatedAtHST` | Last state change | required |
| `UpdatedBy` | Instructor or system | required when available |

Logical uniqueness: `(ProgramId, Username, TestId)`.

This table replaces `Students` L1–L6 and CycleL1–CycleL6 as the authority for program-aware attempts. Keep the legacy columns untouched for rollback and historical interpretation.

### 5.5 Attempts and result attribution

Append `ProgramId` to the existing `Attempts` schema as the final column. Do not reorder current columns.

Every new attempt must snapshot:

- `ProgramId`;
- `Username`;
- `TestId`;
- `Cycle`;
- release settings already snapshotted by the current system; and
- `SubmissionId`.

Do not rewrite the malformed `Results` tab to add a program column. Attribute a new result by joining its `SubmissionId` to its attempt.

For legacy results without a matching program-aware attempt:

- use an explicit configuration value `legacyDefaultProgramId = hokulani`;
- label the attribution source as `legacy_default` in the dashboard model;
- do not modify the source result row; and
- report the count in Data Health.

This rule is acceptable because the existing workbook was operated as the Hōkūlani book before multi-program support. Do not apply it to future workbooks without an explicit configuration decision.

## 6. Program Launcher product

Add a primary **Programs** section to the instructor portal.

### 6.1 Programs list

Show:

- program name and immutable ID;
- Draft, Active, or Archived status;
- assigned and active student count;
- assigned and enabled test count;
- open, scheduled, closed, and hidden test counts;
- active attempts;
- students missing at least one assigned test;
- student URL;
- instructor URL; and
- last update.

Actions:

- Open dashboard;
- Copy student link;
- Copy instructor link;
- Edit assignments;
- Archive;
- Duplicate configuration without attempts or results; and
- Create program.

Archiving requires confirmation and must never delete records.

### 6.2 Create-program wizard

Use five steps.

#### Step 1 — Program information

Fields:

- Program name;
- suggested slug, editable until launch;
- optional start and end dates;
- initial status: Draft or Active.

Validation:

- slug matches `^[a-z0-9]+(?:-[a-z0-9]+)*$`;
- slug is unique;
- name is nonblank;
- end follows start when both exist; and
- archived IDs cannot be reused.

#### Step 2 — Select students

Present the complete populated student bank with:

- search;
- current program memberships;
- select all visible;
- clear all visible;
- selected count; and
- warnings for duplicate or malformed student rows.

Never show or fetch password hashes into the view model.

#### Step 3 — Select tests

Present canonical tests from the shared question bank with:

- title;
- TestId;
- question count;
- source-row health;
- selection checkbox; and
- drag or numeric ordering.

Do not permit a test with no valid questions to launch without an explicit blocking resolution.

#### Step 4 — Configure tests

For each selected test configure:

- initial state;
- opening and closing time;
- maximum attempts; and
- timer in minutes.

Convert timer minutes to seconds for storage. Show both values in the review.

Defaults:

```text
Manual: UNSET
MaxTries: 2
TimeLimitSec: 0
```

`UNSET` retains the current legacy-open behavior.

#### Step 5 — Review and launch

Show:

- program name and ID;
- selected student count and list;
- selected test count and list;
- all release settings;
- generated URLs;
- exact Sheet rows to be added; and
- warnings that do not block launch.

The **Launch Program** button must remain disabled until all blocking errors are resolved.

### 6.3 Launch transaction

Use one Sheets `spreadsheets.batchUpdate` request where possible to:

1. append the `Programs` row;
2. append `ProgramStudents` rows;
3. append `ProgramTests` rows;
4. append `ProgramStudentState` rows for every selected student/test pair; and
5. append one audit event describing counts and ProgramId.

After the request:

1. reread all four program tables;
2. verify exact membership, tests, and state counts;
3. display success only after verification; and
4. display copy buttons for both program URLs.

Do not automatically retry an ambiguous launch. If verification fails, show expected and observed counts and route the instructor to Data Health.

## 7. Program-aware student behavior

### 7.1 Student URLs

Base:

```text
https://portal.projecthokulani.com/
```

Program:

```text
https://portal.projecthokulani.com/?program=summer-2026
```

Direct test:

```text
https://portal.projecthokulani.com/?program=summer-2026&test=SCI-SOIL
```

Never include username, password, submission ID, score, or token in these links.

### 7.2 Program resolution

The URL value is a requested context, not authorization.

After student authentication, the backend must:

1. load active program memberships;
2. reject a requested program without active membership;
3. automatically select the program when exactly one membership exists;
4. return a program picker when multiple active memberships exist and no valid program was requested; and
5. return a clear no-program message when none exists.

### 7.3 Test list

Return only tests that:

- are enabled for the resolved program;
- have a valid shared question bank;
- have a valid program release row; and
- are visible under the release rules.

Attempt counts, completion, resets, and timers are program-specific.

### 7.4 Direct-test behavior

When `test` is present:

- remember it before login;
- authenticate normally;
- validate program membership;
- validate test assignment;
- show its actual status;
- start or resume only when allowed; and
- never bypass releases or maximum attempts.

If unavailable, keep the student inside the correct program and explain whether it is closed, upcoming, complete, hidden, or unassigned.

## 8. Apps Script backend change

This feature cannot be completed solely in the dashboard. Program-specific student access requires one controlled `Code.gs` release.

### 8.1 Entry-point changes

Student requests accept `programId`:

```json
{
  "action": "get_tries",
  "username": "student@example.edu",
  "password": "...",
  "programId": "summer-2026"
}
```

Apply the same context to `auth_and_load` and `submit`.

### 8.2 Required server validations

For every program-aware request:

- authenticate the student first;
- normalize ProgramId and TestId;
- verify active program membership;
- verify the test is enabled for that program;
- load release settings from `ProgramTests`;
- load cycle/state from `ProgramStudentState`;
- count only attempts/results for the same program and cycle;
- snapshot ProgramId in the attempt;
- require submit ProgramId to match the attempt ProgramId; and
- never trust the browser's program membership claim.

### 8.3 Locking

Program-aware start, resume, reset, and submit operations must include ProgramId in their identity keys:

```text
ProgramId + Username + TestId + Cycle
```

The invariant becomes one in-flight attempt per program, student, test, and cycle.

### 8.4 Legacy fallback

During migration, support the current single-program path:

- missing `programId` may resolve to `hokulani` only when the authenticated student has an active Hōkūlani membership;
- do not use the global legacy fallback for students assigned only to another program;
- `Releases` may remain a read-only rollback source;
- new program-aware requests use `ProgramTests`; and
- remove fallback only after the stability window and explicit approval.

### 8.5 Deployment boundary

Implementation must commit and test the complete `Code.gs` change before production action.

Because the repository still has no automated Apps Script deployment connection, production activation requires one controlled Apps Script source update and **New version** deployment by an authorized operator. This is a one-time platform cutover, not the weekly operating model.

After this deployment:

- adding programs requires no Apps Script change;
- adding program memberships requires no Apps Script change;
- assigning existing tests requires no Apps Script change;
- opening, closing, scheduling, resetting, and changing timers require no Apps Script change; and
- dashboard UI changes remain git-only.

Do not create a second student Web App deployment.

## 9. Release management in the dashboard

Replace the read-only Releases table with program-scoped controls.

### 9.1 Test card or row

Show:

- title and canonical TestId;
- Open, Closed, Scheduled, Hidden, or Malformed state;
- stored `Manual` value;
- HST open and close time;
- maximum attempts;
- timer in minutes and stored seconds;
- active student count; and
- last editor/time when available.

Actions:

- **Open now**;
- **Close now**;
- **Schedule window**;
- **Set attempts**;
- **Set time limit**;
- **Return to legacy default** (`UNSET`); and
- **View missing students**.

### 9.2 Semantics

| Action | ProgramTests change |
|---|---|
| Open now | `Manual = OPEN` |
| Close now | `Manual = CLOSED` |
| Schedule | set `OpenAt`, `CloseAt`, `Manual = AUTO` |
| Attempts | update `MaxTries` |
| Timer | convert minutes and update `TimeLimitSec` |
| Legacy default | `Manual = UNSET` |

Closing prevents new starts. An existing attempt retains its snapshotted timer and maximum-attempt context.

### 9.3 Mutation protocol

Every release mutation must:

1. reread the exact current row;
2. show before and after values;
3. identify program and test;
4. require confirmation;
5. update the smallest cell range;
6. append an audit row in the same batch request when possible;
7. reread the row;
8. verify the result; and
9. refresh dependent student and missing-test views.

Do not automatically retry an ambiguous write.

### 9.4 Initializing missing program tables

If any new program table is absent, editors may see **Initialize Program Launcher**.

The initializer must:

- preview the four tabs and their headers;
- create only `Programs`, `ProgramStudents`, `ProgramTests`, and `ProgramStudentState`;
- leave `Students`, `Questions`, `Releases`, `Attempts`, `Results`, and credentials unchanged;
- never invoke `setup()`; and
- verify headers after creation.

## 10. Missing Tests experience

### 10.1 Calculation

For the selected program:

```text
active ProgramStudents
×
enabled ProgramTests
−
complete Results attributed to the same ProgramId
=
missing tests
```

Rules:

- complete means every expected answer is present;
- best score is irrelevant to whether a test is missing;
- an incomplete result remains missing;
- results from another program do not satisfy this program;
- archived programs are excluded by default; and
- legacy Hōkūlani results use the explicit `legacy_default` attribution rule.

### 10.2 Table

Columns:

- Student;
- Missing count;
- Missing tests;
- availability summary; and
- Email action.

The student value must be an accessible button when it can be used as an email recipient.

Each missing test title must be an anchor to:

```text
https://portal.projecthokulani.com/?program=<ProgramId>&test=<TestId>
```

Opening a test link must not bypass login, membership, release, cycle, or attempt checks.

### 10.3 Student email dialog

Clicking a student's email opens an in-page modal. Do not use a small separate browser popup.

Fields:

- To;
- Subject;
- editable plain-text body;
- linked missing-test list; and
- program name.

Actions:

- **Copy subject**;
- **Copy message**;
- **Copy all**;
- **Open email draft**; and
- **Close**.

No automatic send action is permitted.

If the username is not syntactically an email address, disable **Open email draft** but retain copy actions.

### 10.4 Required generic email

Subject:

```text
[Program Name] — missing post-tests
```

Body:

```text
Hi [student],

Our records show that you still need to complete the following assessments:

- [Test title]: [absolute test URL]
- [Test title]: [absolute test URL]

Please complete these assessments this week.

Contact us if you have trouble opening a test.
```

Do not include a date, deadline field, or generated due-date sentence.

Use plain text so copying into UH Gmail preserves usable URLs. Encode the same subject and body for the optional `mailto:` draft action.

## 11. Custom domain migration

Use:

```text
https://portal.projecthokulani.com
```

Do not use `5ninefish.github.io` in student- or instructor-facing generated links after cutover.

### 11.1 DNS and Pages

Required operational steps:

1. Create Cloudflare DNS CNAME `portal` targeting `5ninefish.github.io`.
2. Use DNS-only mode during GitHub domain verification and certificate issuance.
3. Set the repository's GitHub Pages custom domain to `portal.projecthokulani.com`.
4. Wait for certificate readiness.
5. Enable GitHub Pages **Enforce HTTPS**.
6. Verify root student page and `/admin-v2/` before distributing links.

Do not move the application to Cloudflare Pages or Workers. Cloudflare is DNS for this plan.

### 11.2 Build paths

Change the Vite production base from:

```text
/lesson-quiz/admin-v2/
```

to:

```text
/admin-v2/
```

Update all hard-coded or generated references accordingly.

### 11.3 OAuth

Add this authorized JavaScript origin to the UH-owned OAuth Web client:

```text
https://portal.projecthokulani.com
```

Keep `https://5ninefish.github.io` only during the migration window. Remove it after the custom domain is verified and no longer used.

Never place a client secret in the static app. The client ID remains public configuration.

### 11.4 Redirect and rollback

GitHub Pages should redirect the old project-site URL to the configured custom domain. Test this behavior rather than assuming it.

Before changing the domain:

- record the existing Pages configuration;
- verify current student behavior;
- build with the new base path;
- test locally at the new base; and
- define the exact rollback to the old custom-domain setting and Vite base.

## 12. Instructor application structure

Extend the existing structure rather than replace it.

```text
admin-src/src/
├── programs/
│   ├── parser.ts
│   ├── memberships.ts
│   ├── assignments.ts
│   ├── state.ts
│   ├── launcher.ts
│   ├── urls.ts
│   └── mutations.ts
├── releases/
│   ├── form.ts
│   ├── mutations.ts
│   └── verify.ts
├── missing/
│   ├── calculate.ts
│   ├── links.ts
│   ├── email-template.ts
│   └── email-dialog.ts
├── google/
│   ├── sheets-client.ts
│   ├── batch-write.ts
│   └── workbook-meta.ts
├── ui/
│   ├── programs.ts
│   ├── program-wizard.ts
│   ├── releases.ts
│   ├── missing.ts
│   └── dialogs.ts
└── types.ts
```

Keep:

- raw Google API calls out of UI modules;
- parsing separate from rendering;
- mutation planning pure and testable;
- mutation execution separate from verification;
- URL generation centralized; and
- email generation as a pure function.

## 13. Google API write model

### 13.1 Scopes

Read-only launch scopes remain:

```text
openid
email
profile
https://www.googleapis.com/auth/drive.metadata.readonly
https://www.googleapis.com/auth/spreadsheets.readonly
```

Request write scope only after an editor clicks **Enable editing**:

```text
https://www.googleapis.com/auth/spreadsheets
```

Use incremental authorization. Denying the write scope leaves all reporting features usable.

### 13.2 Tokens

- keep access tokens in memory only;
- never place them in browser storage, URLs, logs, or errors;
- revoke on sign-out;
- prompt again after expiry; and
- preserve only nonsensitive view filters through reauthorization.

### 13.3 Write safety

All mutations require:

- `canEdit` capability;
- current-row reread;
- preview;
- explicit confirmation;
- minimal batch write;
- audit append where feasible;
- post-write reread; and
- exact verification.

If another instructor changed the row between preview and confirmation, invalidate the preview and require review again.

## 14. Migration from the existing workbook

Perform migration on a workbook copy first.

### 14.1 Hōkūlani seed

Create:

```text
Programs:
  ProgramId = hokulani
  ProgramName = Hōkūlani
  Status = ACTIVE
```

Seed `ProgramStudents` from populated `Students` rows only.

Seed `ProgramTests` from the six current `Releases` rows, preserving:

- TestId;
- Manual;
- OpenAt;
- CloseAt;
- MaxTries; and
- TimeLimitSec.

Seed `ProgramStudentState` from current student cache/cycle columns:

- `L1`–`L6` caches;
- `CycleL1`–`CycleL6`; and
- default cycle 1 only where missing, with a recorded warning.

### 14.2 Legacy records

- Do not rewrite Results.
- Do not manufacture SubmissionIds.
- Do not attach an unmatched result to an attempt.
- Interpret existing result rows as Hōkūlani through the explicit legacy-default configuration.
- Keep the original source row number.
- Show legacy-attribution counts in Data Health.

### 14.3 Reconciliation report

Produce counts for:

- populated students;
- memberships created;
- program tests created;
- state rows created;
- duplicate students;
- unknown tests;
- missing or malformed release rows;
- missing cycles defaulted to 1;
- legacy results attributed to Hōkūlani;
- results left unassigned; and
- all blocking exceptions.

Migration passes only when every selected student/test pair has exactly one state row and every enabled test has a valid shared question bank.

## 15. Testing requirements

### 15.1 Unit tests

Cover:

- ProgramId slug normalization and uniqueness;
- program membership lookup;
- multi-program student resolution;
- program test assignment;
- program-specific release evaluation;
- program-specific cycle and attempt counting;
- missing tests limited to assigned program tests;
- completion in one program not satisfying another;
- legacy-default result attribution;
- direct-test URL generation;
- email subject and body generation;
- exact sentence “Please complete these assessments this week.”;
- absence of dates from generated email bodies;
- timer minute-to-second conversion;
- mutation preview generation;
- stale-preview detection; and
- verification mismatches.

### 15.2 Apps Script tests

Extend self-tests or extracted pure tests for:

- no program membership;
- one membership auto-selection;
- multiple memberships requiring context;
- URL program mismatch;
- unassigned test denial;
- program-specific open and closed states;
- same student/test active in two programs without collision;
- one in-flight attempt per program/student/test/cycle;
- submit ProgramId mismatch rejection;
- program-specific reset; and
- legacy Hōkūlani fallback.

### 15.3 Browser tests

Cover:

1. Programs list with Draft, Active, and Archived records.
2. Create-program wizard validation.
3. Student search and multi-selection.
4. Test selection and ordering.
5. Release settings and timer conversion.
6. Launch review and blocked-error state.
7. Successful launch verification and generated links.
8. Program filter applied across dashboard screens.
9. Release open, close, schedule, attempts, and timer changes.
10. Viewer sees no enabled write controls.
11. Missing Tests contains clickable titles.
12. Direct links contain program and test but no student data.
13. Student email opens the compose modal.
14. Copy actions use the required generic message.
15. Generated message contains no date.
16. Mail draft is created but not automatically sent.
17. Student deep link resumes after login.
18. Student cannot open an unassigned program/test combination.
19. Custom-domain asset paths resolve.
20. Existing student flow still works without query parameters.

### 15.4 Scale fixtures

Verify browser usability with:

- 25 programs;
- 1,000 shared students;
- six to 50 shared tests;
- 10,000 program memberships;
- 20,000 program state rows;
- 25,000 results; and
- students assigned to multiple programs.

These are browser test fixtures, not claims about Google service limits.

## 16. Implementation phases

### Phase 0 — Confirm baseline

- verify commit `54f63fe` behavior;
- inventory dirty files and preserve unrelated work;
- verify Pages remains legacy `main`/root until domain cutover;
- confirm no live workbook mutations;
- confirm exact live Apps Script deployment ID/version before backend work; and
- confirm `portal.projecthokulani.com` is reserved for this application.

Exit: baseline recorded and rollback points known.

### Phase 1 — Program model and fixtures

- add program types and parsers;
- add synthetic program tables;
- implement program-aware snapshot building;
- implement legacy Hōkūlani attribution;
- update Data Health; and
- add unit tests.

Exit: read-only multi-program reports reconcile against fixtures.

### Phase 2 — Program Launcher read-only UX

- Programs navigation;
- programs list;
- five-step wizard;
- preview-only launch plan;
- generated URLs; and
- responsive/keyboard behavior.

Exit: instructors can fully configure and review a launch without writing.

### Phase 3 — Write foundation and workbook-copy launch

- incremental write authorization;
- program-table initializer;
- batch mutation executor;
- audit append;
- post-write verification;
- launch on a workbook copy; and
- reconciliation report.

Exit: repeated launch attempts cannot create duplicate program rows.

### Phase 4 — Program-aware Apps Script

- update Code.gs lookup and validation;
- add ProgramId to Attempts;
- use ProgramStudentState;
- filter student tests by program;
- preserve legacy fallback;
- add self-tests; and
- rehearse against the workbook copy.

Exit: all program isolation and existing student-regression tests pass.

### Phase 5 — Release controls

- editable ProgramTests UI;
- open/close/schedule;
- max attempts;
- timer in minutes;
- reset cycle by program/student/test;
- confirmation and verification; and
- audit entries.

Exit: Sheet menu is no longer required for routine release management.

### Phase 6 — Missing Tests and email workflow

- program-aware calculation;
- linked titles;
- direct student URLs;
- clickable student email;
- compose modal;
- copy actions;
- mail draft action; and
- exact no-date message tests.

Exit: every generated link and message is correct for the selected program.

### Phase 7 — Custom domain

- configure Cloudflare DNS;
- configure GitHub Pages custom domain;
- change Vite base;
- update generated links;
- add OAuth origin;
- verify HTTPS;
- verify old URL redirect; and
- smoke-test student and instructor paths.

Exit: all distributed links use `portal.projecthokulani.com`.

### Phase 8 — Production cutover

1. Back up the workbook.
2. Record current Apps Script deployment and source.
3. Initialize program tables.
4. Seed and reconcile Hōkūlani.
5. Deploy the tested program-aware Code.gs as a new version of the existing Web App.
6. Smoke-test login, program selection, start, resume, submit, and missing-test calculation.
7. Enable dashboard writes.
8. Launch Hōkūlani as the first active program.
9. Activate custom-domain links.
10. Monitor errors and Sheet rows through the first real attempts.

Do not create a second production Web App.

## 17. Rollback

Before any new program-aware attempt:

- restore the previous Apps Script deployment version;
- disable dashboard writes;
- point users to the prior student URL if required; and
- leave new program tabs unused but intact.

After a program-aware attempt exists:

- do not silently revert to a backend that cannot understand ProgramId;
- pause new starts;
- preserve program tables and attempt rows;
- fix forward or execute an explicit compatibility rollback; and
- never delete the new records to simulate rollback.

The custom domain can roll back independently by restoring the previous GitHub Pages domain and Vite base, but distributed email links will then need redirect coverage.

## 18. Acceptance criteria

### Programs

- Instructor can create a program from shared students and tests.
- A program launches without cloning code, workbook, OAuth, or Apps Script.
- A student may belong to multiple programs.
- A test may belong to multiple programs with different release settings.
- Archiving preserves history.

### Student enforcement

- Backend validates program membership and test assignment.
- URL parameters never grant access by themselves.
- Attempts are isolated by program.
- Resets affect only the selected program/student/test state.
- New results are attributable through their program-aware attempt.

### Releases

- Dashboard can open, close, schedule, set attempts, and set timers.
- Timer input is in minutes and stored in seconds.
- Closing a test does not change an existing attempt's timer.
- Every write is previewed and verified.
- `setup()` is never called.

### Missing Tests

- Only program-assigned tests are considered.
- Test titles are clickable student links.
- Clicking the student opens a compose modal.
- The generated email contains no date.
- The body includes “Please complete these assessments this week.”
- No email is sent automatically.

### Domain

- Student and instructor URLs use `portal.projecthokulani.com`.
- HTTPS is enforced.
- OAuth accepts the custom origin.
- Built assets contain no stale `/lesson-quiz/admin-v2/` dependency.
- No generated email contains a `5ninefish.github.io` link.

### Cost and operations

- Dalen pays $0 personally.
- No personal Mac serves traffic.
- Routine program creation and release changes require no Apps Script deployment.
- Dashboard changes remain git-push deployments.
- One controlled program-aware Apps Script cutover is documented and tested.

## 19. Explicit non-goals

- Automated creation of physical Apps Script deployments.
- Separate workbook per normal program.
- Paid hosting or PostgreSQL.
- General LMS features such as assignments, discussion, grading comments, or messaging history.
- Automatic email delivery or bulk-email campaigns.
- Editing the shared question bank from this phase.
- Deleting historical students, attempts, results, or programs.
- Rewriting malformed legacy Results in place.
- Supporting public unauthenticated instructor access.

## 20. Grok Build execution report

Before implementation, Grok Build must report:

1. accepted data model and any exact column substitutions;
2. how ProgramId is persisted on Attempts and joined to Results;
3. the legacy Hōkūlani attribution rule;
4. exact Apps Script functions requiring change;
5. how multi-program students select context;
6. exact Sheets API batch operations for launch and release writes;
7. custom-domain and Vite-base migration steps;
8. the test plan protecting the current student flow;
9. the single production Apps Script deployment boundary; and
10. any required user action, separated from work Grok can execute.

Grok must stop before:

- changing Cloudflare DNS;
- changing GitHub Pages custom-domain settings;
- changing UH OAuth origins;
- writing the live workbook;
- updating the live Apps Script project; or
- publishing a new Apps Script deployment version.

Those are production-state changes and require Dalen's explicit approval after copy-environment evidence is complete.

## 21. Definition of done

This build is complete when an instructor can use one professional dashboard to select students and tests from shared banks, launch a program, operate program-specific releases, identify missing work, copy or open a correct no-date student email draft, and distribute `portal.projecthokulani.com` links without creating another website, workbook, OAuth client, or Apps Script deployment.

The current student quiz must continue to authenticate, start, resume, time, and submit correctly throughout the migration.
