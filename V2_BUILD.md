# Hōkūlani Post-Test Portal V2 — Zero-Cost Sheet-Backed Build Specification

Status: **Approved direction; implementation specification for Grok Build**  
Repository: `/Users/dalen/Public/clients/lesson-quiz`  
Reviewed legacy commit: `149f7d4`  
Document revision date: 2026-09-15 (Pacific/Honolulu)  
Runtime budget: **$0 personal spend and no paid hosting**

## 1. Executive directive

Build a full-window instructor portal for the existing Hōkūlani post-test system without adding a paid server, VPS, database, or service billed to Dalen.

The current student quiz remains live on GitHub Pages and continues using the existing bound Apps Script Web App and Google Sheet. The new work is an instructor-only static web application hosted on the repository's existing GitHub Pages site. It reads and, in later phases, performs narrowly defined writes through the Google Sheets API using the signed-in instructor's UH Google account.

Google Sheets remains the runtime source of truth. It is not a background dump in this version.

The instructor portal must:

- open in a normal full browser tab;
- support hundreds of student accounts without a cramped popup;
- deploy by git push, with no recurring Apps Script copy/paste or deployment versions;
- use a UH-owned Google OAuth client that requires no billing account;
- rely on Google workbook permissions for data authorization;
- keep roster, results, credentials, and answer keys out of public GitHub Pages files;
- leave the live student path unchanged until a separately approved change;
- treat the malformed legacy workbook as input, not silently repair it;
- make data quality problems visible instead of manufacturing clean-looking numbers; and
- cost Dalen nothing personally.

Do not build or provision InterServer, Fly.io, Render, Railway, Vercel server functions, Cloud Run, PostgreSQL, Docker infrastructure, or a public service on PeakForge or the PM Mac.

## 2. Settled constraints

These are requirements, not open design questions.

| Area | Decision |
|---|---|
| Personal cost | $0. No personal card, reimbursement assumption, or paid trial dependency. |
| Student runtime | Existing GitHub Pages `index.html` plus current Apps Script Web App. |
| Instructor runtime | Static application on the existing GitHub Pages site. |
| Data store | Existing Hōkūlani Google Sheet. |
| Instructor identity | UH Google account through Google Identity Services. |
| Authorization | Google workbook sharing permissions; editors can mutate, permitted viewers may read. |
| Deployment | Git commit and GitHub Pages publication. No Apps Script deployment for dashboard-only changes. |
| Apps Script | Frozen for this project phase except a separately approved student-production fix. |
| Data classification | Project owner confirms no identifying or protected data is in scope. This does not make administrative writes public. |
| Program separation | One workbook and one configured dashboard deployment per program. Do not mix Hōkūlani and Ka Pilina data. |
| Student visibility | Students never receive scores, answer keys, roster data, or instructor reports. |
| Live workbook changes | No mutation during development or test. Production writes require the phase gates below. |
| `clasp` | Not required and not introduced as the operating model. |

## 3. What V2 is and is not

V2 is a Sheet-backed instructor portal. It replaces the failed instructor user experience, not the student assessment backend.

V2 is responsible for:

- presenting current workbook data clearly;
- normalizing known legacy row shapes in browser memory;
- giving instructors fast search, filters, summaries, and exports;
- showing releases, active attempts, completed attempts, best complete scores, and missing tests;
- reporting malformed, ambiguous, or skipped rows;
- optionally performing a small set of reviewed Sheet mutations; and
- providing an auditable git history for dashboard code.

V2 is not:

- a new student portal;
- a PostgreSQL migration;
- a general-purpose LMS;
- a replacement for Canvas or Google Classroom;
- a server-side application;
- a promise of database-style transactions across arbitrary Sheet edits;
- a security-grade audit service;
- a question-authoring system; or
- a reason to change student credentials during test week.

If future requirements demand strict roles, tamper-proof audit logs, high-concurrency writes, server-controlled transactions, or integrations requiring secrets, those requirements trigger a funded backend project owned by the employer. They do not justify personal spending.

## 4. Current system and root cause

### 4.1 Live path

```text
Student browser
  GitHub Pages index.html
        |
        | JSON POST
        v
Bound Apps Script Web App
  Code.gs doPost
        |
        v
Hōkūlani Google Sheet
```

The live student path has operational constraints but remains in service. This project must not break or silently replace it.

### 4.2 Failed instructor path

The instructor interface has moved through:

1. a small `HtmlService` dialog;
2. an Apps Script Web App tab; and
3. public `admin.html` code calling `dash_*` actions on `doPost`.

Dashboard work has repeatedly required some combination of copying files into Apps Script, saving, creating a new deployment version, and diagnosing `ScriptError` responses. Repository state does not prove live Apps Script state because the project has no source-controlled deployment link.

The failure is operational architecture, not merely CSS:

- UI code and live backend code deploy through different systems;
- dashboard availability depends on the Apps Script deployment matching the repository;
- data reads and instructor actions share the public student Web App boundary;
- errors are flattened into generic JSON responses;
- the Sheet schema has drifted; and
- reactive fixes have increased uncertainty without restoring dependable operation.

### 4.3 Workbook facts that the portal must handle

The inspected Hōkūlani workbook contains:

- `Students`: five populated accounts plus roughly 169 blank initialized rows;
- `Questions`: 30 questions, five for each of six assessments;
- `Releases`: six assessment rows;
- `Results`: eight legacy records with inconsistent row shapes and no valid header row;
- `Results` row 1: a real result row with later labels appended in columns T–X;
- `Attempts`, `Audit`, and `InProgress`: no operational data rows at inspection time; and
- a 2026-09-15 result with no matching attempt or audit row.

The application must not assume that row 1 is a header merely because some cells contain header-like labels.

## 5. Target architecture

```text
                                      +-------------------------+
Student browser --------------------->| Existing GitHub Pages   |
                                      | index.html              |
                                      +------------+------------+
                                                   |
                                                   v
                                      Existing Apps Script Web App
                                                   |
                                                   v
                                      Hōkūlani Google Sheet
                                                   ^
                                                   |
Instructor browser                                 | Google Sheets API
  GitHub Pages /admin-v2/                          |
        |                                          |
        +--> Google Identity Services -------------+
             UH-owned OAuth client
```

There is no application server between the instructor browser and Google. GitHub Pages hosts only static HTML, CSS, JavaScript, icons, and fonts. Google hosts identity, authorization, the Sheets API, Apps Script, and the workbook.

### 5.1 Why this meets the cost constraint

- The repository already uses GitHub Pages.
- The Sheet and Apps Script are already part of the work system.
- The OAuth client belongs to UH and must not require a billing account.
- The instructor application runs in the browser.
- There is no VPS, managed database, container, background worker, or personal machine in the request path.

### 5.2 Source-of-truth rules

| Data | Runtime authority |
|---|---|
| Student accounts and password hashes | `Students` tab |
| Questions and correct answers | `Questions` tab |
| Releases and attempt limits | `Releases` tab |
| Active attempt snapshots | `Attempts` tab |
| Submitted results | `Results` tab |
| Existing operational audit entries | `Audit` tab and Google revision history |
| Dashboard filters and display preferences | Browser storage only; never authoritative |
| Dashboard-derived summaries | Recomputed from Sheet data; never authoritative |

There is no Sheet export job because the Sheet is already the live record.

## 6. Security and trust model

### 6.1 Public code, private data

GitHub Pages files are public. They may contain:

- the Google OAuth client ID;
- the spreadsheet ID;
- assessment IDs and public titles; and
- static application configuration.

These are identifiers, not credentials. The workbook ID does not grant workbook access.

GitHub Pages files must never contain:

- access tokens or refresh tokens;
- Apps Script authorization material;
- student account rows;
- password hashes or plaintext passwords;
- result rows;
- answer keys;
- exported workbook snapshots; or
- staff secrets.

### 6.2 Google identity flow

Use Google Identity Services' browser authorization token model.

Required configuration:

- OAuth application type: Web application;
- owner: UH-controlled Google Cloud project/account;
- authorized JavaScript origin: `https://5ninefish.github.io`;
- no client secret in browser code;
- no personal billing account;
- app visibility restricted to the UH Workspace organization when supported by UH policy; and
- Sheets scope requested only when the instructor opens the portal.

Initial read-only scopes:

```text
openid
email
profile
https://www.googleapis.com/auth/drive.metadata.readonly
https://www.googleapis.com/auth/spreadsheets.readonly
```

The Drive metadata scope is used only to read the workbook name and `capabilities.canEdit`. It does not authorize file-content reads. The Sheets read-only scope supplies workbook values.

When Phase 5 writes are approved, request this additional scope through an explicit “Enable editing” action:

```text
https://www.googleapis.com/auth/spreadsheets
```

Do not request write access during the read-only launch. Do not request general Drive file-content access.

Use `google.accounts.oauth2.initTokenClient`. Do not reuse the current `google.accounts.id` ID token as a Sheets API credential.

Store access tokens in memory only. Do not persist them in `localStorage`, `sessionStorage`, cookies, URLs, logs, or error reports. When a token expires, prompt for authorization again and preserve only the user's local view state.

### 6.3 Authorization boundary

The Google Sheet access-control list is the authorization boundary:

- a Google account without workbook access cannot read it through the API;
- a viewer cannot perform instructor writes;
- an editor can perform the permitted writes; and
- removal from the workbook immediately removes the underlying data access.

Use the Drive API's `capabilities.canEdit` field to choose the visible UI state. This is a usability check, not a second authorization layer; Google still evaluates every Sheets API request.

The static application cannot independently enforce a secret staff allowlist. Any UI-only role check can be bypassed by an authorized Sheet editor and therefore must not be described as a security control.

### 6.4 Data classification statement

The project owner confirms that no identifying or protected data is in scope. Continue to keep the workbook non-public because:

- student credentials must not be disclosed;
- results and roster operations are instructor functions;
- answer keys must not reach student clients; and
- public write access would allow operational disruption.

Do not make legal or institutional compliance claims in the application.

### 6.5 Browser safety

- Render all Sheet-provided text with text nodes, not `innerHTML`.
- Treat question text, usernames, titles, audit details, and imported CSV cells as untrusted strings.
- Use a restrictive Content Security Policy meta tag compatible with Google Identity Services.
- Do not load analytics, advertising, chat widgets, or third-party fonts.
- Do not log API payloads.
- Redact tokens and password fields from all error objects.
- Clear in-memory data and revoke the access token on sign-out.

## 7. Workbook contract

V2 must consume the workbook as it exists. It must not run `setup()` or call any operation that expands blank rows or rewrites legacy records.

### 7.1 Canonical assessment identifiers

| Legacy lesson | Canonical TestId | Display title |
|---|---|---|
| `L1` | `SCI-SOIL` | Soil — Science Lesson 1 |
| `L2` | `SCI-CORAL` | 3D Printing & Coral — Science Lesson 2 |
| `L3` | `SCI-CS` | Computer Science — Science Lesson 3 |
| `L4` | `SCI-ASTRO` | Astronomy — Science Lesson 4 |
| `L5` | `SCI-HEALTH` | Health — Science Lesson 5 |
| `L6` | `SCI-DM` | Digital Media — Science Lesson 6 |

Normalize legacy IDs at the parsing boundary. Use canonical IDs inside the dashboard. Do not create both `L3` and `SCI-CS` as separate assessments.

### 7.2 `Students`

Expected columns:

```text
A Username
B PasswordHash
C:H L1:L6 current-cycle sit cache
I:N CycleL1:CycleL6
```

Rules:

- Ignore any row whose normalized username is blank.
- Do not count initialized blank rows as students.
- Never return column B from the data adapter to UI components.
- Treat missing cycle values as cycle 1 for display, but report the defect.
- Do not infer account activity from blank initialized counters.

### 7.3 `Questions`

Expected columns:

```text
Lesson | Q# | Question | A | B | C | D | E | F | Correct
```

Rules:

- The instructor dashboard may fetch columns A:I for titles and question counts.
- Do not fetch `Correct` for ordinary dashboard/report views.
- Never include correct answers in any public static asset.
- Question-count logic must support variable-length assessments.

### 7.4 `Releases`

Expected columns:

```text
TestId | Strand | Title | OpenAt | CloseAt | Manual | MaxTries | TimeLimitSec
```

Preserve the current semantics:

| Manual value | Meaning |
|---|---|
| `UNSET` | Legacy-open behavior |
| `OPEN` | Open immediately; manual override |
| `CLOSED` | Closed immediately; manual override |
| `AUTO` with valid window | Evaluate current time against the window |
| `AUTO` with blank `OpenAt` | Hidden/unavailable |

Display and edit dates in `Pacific/Honolulu`. Store values in the same shape expected by the existing Apps Script.

### 7.5 `Attempts`

Expected columns:

```text
Username | TestId | Cycle | SubmissionId | StartedAt | TimeLimitSec |
MaxTriesSnapshot | QuestionFingerprint | CorrectSnapshot | Status | QuestionsSnapshot
```

Rules:

- Do not expose `CorrectSnapshot` in general table models, exports, logs, or error reports.
- Treat `in_flight` as active unless its calculated deadline has passed.
- Mark an expired display state in memory; do not mutate the row merely by viewing it.
- Show unmatched or malformed attempts in Data Health.

### 7.6 `Results`

The parser must support the observed legacy workbook rather than assume a clean schema.

Rules:

1. Determine whether row 1 is a real header by validating multiple expected header names and positions.
2. If validation fails, treat row 1 as data.
3. Detect metadata labels appended in columns T–X without treating the entire row as a header.
4. Support both five-question and longer historical result shapes.
5. Normalize `L1`–`L6` to canonical TestIds.
6. Keep the original row number and raw-width metadata for diagnostics.
7. Skip fully blank rows.
8. Never invent a missing submission ID, attempt row, audit row, cycle, or answer.
9. A result is complete only when all expected question positions have nonblank answers.
10. Best score means the highest score among complete results only.
11. Ties may use the earliest completed row for stable display.
12. Every nonblank unparsed row must appear in Data Health.

### 7.7 `Audit`, `InProgress`, `BestScores`, and `MissingTests`

- Empty operational tabs are valid and must render as empty states.
- `InProgress`, `BestScores`, and `MissingTests` are derived reports, not authorities.
- Recompute these views in the browser from source tabs.
- Do not require report tabs to exist.
- Existing `Audit` entries may be displayed, but Google Sheet revision history remains the stronger record of who changed a workbook.

### 7.8 Optional V2 metadata tab

Do not require new tabs for the first read-only release.

If controlled writes are approved, one `V2_Config` tab may be created through a preview-and-confirm operation containing:

```text
Key | Value | UpdatedAtHST | UpdatedBy
schema_version | 1 | ... | ...
program_code | hokulani | ... | ...
```

Do not create replacement copies of `Students`, `Questions`, `Attempts`, or `Results`. The objective is one runtime, not a shadow database inside the same workbook.

## 8. Instructor product requirements

### 8.1 Application shell

- Dedicated route: `/lesson-quiz/admin-v2/` during acceptance.
- Full-window responsive layout optimized for desktop and iPad landscape.
- Persistent left navigation on wide screens and compact navigation on smaller screens.
- Visible workbook name, last refresh time, connection state, and signed-in account.
- One-click refresh.
- Clear read-only versus edit-capable state.
- No modal-sized primary workspace.
- No auto-refresh while a destructive confirmation is open.

### 8.2 Overview

Show:

- populated student count;
- assessment count;
- current release states;
- active and apparently expired attempts;
- complete-result count;
- students missing each assessment;
- most recent result timestamp;
- parse warning count; and
- last successful refresh.

Every metric must link to the filtered detail view that produced it.

### 8.3 Roster

- Search by normalized account identifier.
- Sort and paginate hundreds of accounts.
- Show active account row, current cycles, and current-cycle sit cache.
- Hide password hashes completely.
- Ignore blank initialized rows.
- Export the visible noncredential fields to CSV in the browser.
- Provide a roster import preview before any write-capable phase.

### 8.4 Assessments and releases

- Show human titles and canonical TestIds.
- Show `UNSET`, `OPEN`, `CLOSED`, and `AUTO` meaning in plain language.
- Show window times in HST.
- Show maximum tries and timer minutes.
- Highlight malformed dates, duplicate assessment rows, and missing rows.
- In the write phase, allow open, close, and save-window operations with confirmation and post-write verification.

### 8.5 Attempts

- Filter by student, assessment, cycle, status, and date.
- Show start time, calculated deadline, remaining time, and submission ID.
- Distinguish active, apparently expired, done, and malformed records.
- Never display correct-answer snapshots.
- Poll only while this screen is visible.

### 8.6 Results

- Filter by student, assessment, cycle, completeness, status, and date.
- Display score only to authorized instructors.
- Show complete versus incomplete explicitly.
- Show best complete score, not best partial score.
- Link a result to its matching attempt when a real submission ID match exists.
- Label orphan results rather than fabricating a relationship.
- Export the current filtered view to CSV without writing a public file.

### 8.7 Missing tests

- Calculate against populated roster rows only.
- Treat an assessment as complete only when at least one complete result exists.
- Support all assessments or one selected assessment.
- Allow sorting by number missing and account identifier.

### 8.8 Data Health

Provide one nontechnical page listing material operational issues:

- invalid or absent headers;
- blank initialized roster rows;
- duplicate usernames;
- duplicate release rows;
- unknown assessment IDs;
- malformed dates or scores;
- results with no matching attempt;
- attempts with no matching result when status implies completion;
- skipped rows and the reason; and
- fetched range sizes and refresh time.

Data Health is diagnostic. It must not offer a one-click "fix everything" action.

## 9. Google API data adapter

Keep Google API calls behind one adapter so UI components never parse raw Sheet rows.

Recommended interface:

```ts
interface WorkbookGateway {
  loadDashboard(signal?: AbortSignal): Promise<DashboardSnapshot>;
  loadAttempts(signal?: AbortSignal): Promise<AttemptRecord[]>;
  refreshResults(signal?: AbortSignal): Promise<ResultRecord[]>;
  updateRelease(input: ReleaseChange): Promise<VerifiedMutation>;
  resetCycle(input: CycleReset): Promise<VerifiedMutation>;
  importRoster(input: RosterImport): Promise<VerifiedMutation>;
}
```

Implementation requirements:

- use Drive API file metadata to load the workbook name and `capabilities.canEdit`;
- use `spreadsheets.values.batchGet` for related read ranges;
- request bounded columns, not entire worksheets;
- let the API trim trailing blank rows;
- cancel superseded requests with `AbortController`;
- cache the last successful parsed snapshot in memory;
- never render a partial refresh as authoritative;
- retain the last good screen if a refresh fails;
- expose typed error categories: sign-in required, permission denied, quota/rate limit, network, invalid workbook, parse failure, and write verification failure; and
- use exponential backoff only for safe read retries and provider throttling.

Do not automatically retry an ambiguous write.

## 10. Controlled write operations

Ship Phase 1 read-only. Enable writes only after read behavior is accepted against a workbook copy and the exact cell changes are reviewed.

### 10.1 General mutation protocol

Every write action must:

1. fetch the current source row immediately before confirmation;
2. show the instructor the exact before and after values;
3. require a deliberate confirmation;
4. submit the smallest possible Sheets API request;
5. append a convenience audit record in the same `spreadsheets.batchUpdate` request when feasible;
6. reread the affected range;
7. verify that the intended values landed;
8. show success only after verification; and
9. refresh dependent summaries.

If verification differs, stop and display both expected and observed values. Do not retry automatically.

### 10.2 Release writes

Allowed:

- set `Manual` to `OPEN`;
- set `Manual` to `CLOSED`;
- set `OpenAt`, `CloseAt`, `MaxTries`, and `TimeLimitSec`, then set `Manual` to `AUTO`.

Required validation:

- exactly one release row matches the canonical TestId;
- maximum tries is a positive integer;
- timer is zero or a nonnegative integer number of seconds;
- dates parse in HST; and
- closing time is after opening time when both exist.

Do not write if the release row is missing or duplicated. Direct the instructor to Data Health.

### 10.3 Cycle reset

A reset means cycle bump, not deletion.

For one student and one assessment:

- locate exactly one populated `Students` row;
- read the current `CycleL*` and corresponding `L*` cache;
- increment cycle by one;
- set the corresponding sit cache to zero;
- leave all `Results` and `Attempts` rows unchanged;
- append an audit description; and
- verify both cells after the write.

For all assessments, show all twelve changed cells in the confirmation. Never provide bulk reset for the entire roster.

### 10.4 Roster import

Import is append-only for new accounts in this phase.

The browser must:

- accept CSV or pasted two-column data;
- normalize usernames;
- reject blank usernames and passwords;
- detect duplicates within the import and against populated workbook rows;
- preview accepted, duplicate, and rejected rows;
- hash accepted plaintext passwords with Web Crypto SHA-256 before any Sheet write, matching the current student backend;
- discard plaintext immediately after hashing;
- append only the accepted rows with zero sit caches and cycle 1; and
- verify the appended usernames and hashes without displaying hash values.

Do not rotate existing student passwords during test week. Do not write plaintext passwords to `Students` or `RosterImport`.

### 10.5 Writes excluded from V2

- Editing questions or correct answers.
- Deleting students.
- Deleting results or attempts.
- Rewriting malformed legacy result rows.
- Running `setup()`.
- Creating a second student Web App deployment.
- Mass password rotation.
- Automatic data cleanup.

## 11. Application structure

Use a static, modular TypeScript application. A small build step is acceptable because GitHub Actions runs it and GitHub Pages serves only the generated static files.

Recommended repository shape:

```text
lesson-quiz/
├── index.html                     # existing student portal; preserve behavior
├── admin.html                     # failed legacy dashboard; keep during transition
├── admin-v2/
│   ├── index.html
│   └── src/
│       ├── main.ts
│       ├── config.ts
│       ├── auth/
│       │   └── google-token.ts
│       ├── google/
│       │   ├── sheets-client.ts
│       │   └── ranges.ts
│       ├── workbook/
│       │   ├── students.ts
│       │   ├── questions.ts
│       │   ├── releases.ts
│       │   ├── attempts.ts
│       │   ├── results.ts
│       │   ├── audit.ts
│       │   └── snapshot.ts
│       ├── reports/
│       │   ├── best-scores.ts
│       │   ├── missing-tests.ts
│       │   └── data-health.ts
│       ├── mutations/
│       │   ├── release.ts
│       │   ├── reset-cycle.ts
│       │   └── roster-import.ts
│       ├── ui/
│       │   ├── shell.ts
│       │   ├── overview.ts
│       │   ├── roster.ts
│       │   ├── attempts.ts
│       │   ├── results.ts
│       │   ├── releases.ts
│       │   └── data-health.ts
│       ├── csv.ts
│       ├── errors.ts
│       └── types.ts
├── tests/
│   ├── fixtures/
│   ├── unit/
│   └── browser/
├── scripts/
│   └── build-pages.mjs
├── .github/workflows/pages.yml
├── package.json
├── tsconfig.json
├── vite.config.ts
└── V2_BUILD.md
```

Grok may adjust file names, but must preserve these boundaries:

- raw API access;
- workbook parsing;
- report derivation;
- mutations;
- UI rendering; and
- test fixtures.

Do not put parsing and mutation logic directly inside page event handlers.

## 12. Configuration

`admin-v2/src/config.ts` may contain public, program-specific identifiers:

```ts
export const PROGRAM = {
  code: 'hokulani',
  title: 'Hōkūlani Post-Test Portal',
  spreadsheetId: '<HOKULANI_WORKBOOK_ID>',
  googleClientId: '<UH_OWNED_WEB_CLIENT_ID>',
  timezone: 'Pacific/Honolulu',
} as const;
```

The spreadsheet ID and OAuth client ID are not secrets. Google permissions remain authoritative.

Rules:

- no `.env` file is needed for the static application;
- do not request access to Dbrain `.env` files;
- no OAuth client secret exists in the browser project;
- no service account key exists;
- no personal Google Cloud project is used;
- each program deployment receives its own config and workbook;
- answer keys and workbook row data are never build-time inputs; and
- production configuration changes require a reviewed git commit.

## 13. Performance and usability

Design for hundreds of populated students and the workbook's realistic result history, not the prior PostgreSQL target of 100,000 attempts.

Requirements:

- render roster and result tables with pagination or windowing;
- debounce text search;
- derive indexes once per refresh rather than scanning rows during every render;
- batch initial API reads;
- lazy-load attempt and result detail where practical;
- refresh active attempts no faster than every 30 seconds and only when visible;
- stop polling when the browser tab is hidden;
- show progress for API operations longer than 300 ms;
- retain last good data through transient failures; and
- provide a manual refresh after rate-limit errors.

Initial acceptance fixtures:

- 1,000 populated student rows;
- 25,000 result rows across mixed legacy shapes;
- 5,000 attempt rows;
- six assessments; and
- 200 malformed or blank rows.

These fixtures test browser behavior. They are not claims about Sheets service limits.

## 14. Accessibility and visual design

- Meet WCAG 2.1 AA contrast and keyboard behavior for primary workflows.
- Use semantic headings, landmarks, labels, tables, buttons, and dialogs.
- Keep focus visible.
- Move focus to error summaries after failed actions.
- Do not communicate release or attempt state by color alone.
- Support 1024-pixel iPad landscape without horizontal page scrolling.
- Use horizontal table scrolling only inside the table container when unavoidable.
- Keep destructive actions visually separated from navigation and filters.
- Use plain language: “Reset attempt allowance” with an explanation that history remains.
- Confirm writes with the affected student, assessment, and exact state change.

## 15. Error handling

Map failures to user actions:

| Failure | Instructor message/action |
|---|---|
| Google sign-in absent or expired | Sign in again; keep local filters. |
| Workbook access denied | Use a UH account with workbook access or request sharing. |
| Viewer attempts a write | Explain that editor permission is required. |
| Network failure | Keep last good data; offer retry. |
| Sheets quota/rate limit | Pause polling; show manual retry time. |
| Missing tab | Show Data Health; do not call `setup()`. |
| Duplicate source row | Block affected mutation; identify source rows. |
| Parse warning | Exclude only the affected record and show why. |
| Ambiguous write result | Reread; never retry automatically. |
| Student Apps Script failure | State that the instructor dashboard cannot repair the student backend. |

Do not show stack traces or raw Google API payloads to instructors.

## 16. Test strategy

### 16.1 Unit tests

Use sanitized fixtures representing the observed workbook.

Cover:

- blank student rows;
- missing and malformed cycle values;
- canonical `SCI-*` and legacy `L*` mapping;
- real header and headerless `Results` shapes;
- row 1 containing data plus labels in T–X;
- five-question and variable-length results;
- complete and incomplete attempts;
- best score among complete attempts only;
- missing-test calculation;
- orphan result and orphan attempt detection;
- release-state evaluation at HST boundaries;
- CSV escaping;
- HTML injection strings rendered as text;
- roster import normalization and duplicate detection;
- SHA-256 output compatibility; and
- mutation before/after plans.

### 16.2 API adapter tests

Mock Google API responses. Cover:

- successful batch read;
- 401 token expiry;
- 403 workbook denial;
- 403 write denial for a viewer;
- 429 throttling;
- partial or malformed value arrays;
- cancelled refresh;
- last-good snapshot preservation; and
- post-write reread mismatch.

Do not use the live Hōkūlani workbook in automated tests.

### 16.3 Browser tests

Cover:

1. Signed-out landing screen.
2. Successful mocked Google authorization.
3. Overview renders observed workbook anomalies without crashing.
4. Roster ignores blank initialized rows.
5. Search and pagination at 1,000 students.
6. Release filters and HST formatting.
7. Active-attempt polling stops when hidden.
8. Results filters and best-score calculation.
9. Data Health links to source row numbers.
10. CSV export contains only the visible allowed fields.
11. Read failure retains the last good screen.
12. Viewer cannot see enabled write controls.
13. Release write preview, confirm, verify, and mismatch states.
14. Cycle reset preview shows history is retained.
15. iPad landscape and desktop layouts.
16. Keyboard-only navigation through every primary screen.

### 16.4 Live acceptance tests

Use a copy of the workbook shared with designated UH test accounts.

- one viewer verifies read-only behavior;
- one editor verifies controlled writes;
- no test targets the live workbook;
- no real passwords are copied;
- the copy includes sanitized reproductions of malformed result shapes; and
- every write test records its before and after ranges.

## 17. GitHub Pages delivery

### 17.1 Continuous integration

Every pull request must run:

1. locked dependency install;
2. formatting check;
3. lint;
4. TypeScript type check;
5. unit tests;
6. browser tests with mocked Google APIs;
7. production static build;
8. scan of built assets for forbidden fixture markers and secrets; and
9. link/path verification for both student and instructor entry points.

### 17.2 Publication

GitHub Actions may publish the static artifact to GitHub Pages after checks pass on `main`.

The build must preserve:

- the current student URL and `index.html` behavior;
- the configured Apps Script student API URL;
- existing static question images/assets; and
- a distinct `/admin-v2/` route.

Changing the repository's Pages publication source is a one-time operational step. Document it and verify the student URL before and after. Routine dashboard changes must require only reviewed git changes.

### 17.3 No-secret deployment

The Pages workflow must not use:

- a Google OAuth client secret;
- a Sheets access token;
- a service account credential;
- Dbrain environment files;
- personal hosting credentials; or
- a paid deployment token.

## 18. Implementation sequence

### Phase 0 — Ratification and freeze

Grok Build must:

- confirm this zero-cost architecture;
- verify the current GitHub Pages publication method;
- verify the UH-owned OAuth client can authorize the required Sheets scope without billing;
- inventory current repository changes without overwriting them;
- preserve the current student URL and Apps Script endpoint; and
- state that no live workbook or deployment will be changed during development.

Exit gate: no unresolved paid service, personal host, or student cutover assumption remains.

### Phase 1 — Read-only data foundation

Deliver:

- isolated `admin-v2` application shell;
- typed Google token and Sheets clients;
- workbook range configuration;
- parsers for Students, Questions A:I, Releases, Attempts excluding correct snapshots, Results, and Audit;
- observed-shape fixtures;
- Data Health report;
- unit tests; and
- mocked browser tests.

Exit gate:

- no live workbook writes;
- row 1 of malformed Results is treated correctly;
- blank students are excluded;
- no hashes, correct answers, or tokens reach view models or logs; and
- build output contains no workbook data.

### Phase 2 — Full-window reporting UI

Deliver:

- overview;
- roster;
- releases read view;
- active attempts;
- results and attempt history;
- missing tests;
- best complete scores;
- Data Health;
- browser-only CSV exports;
- responsive desktop/iPad design; and
- loading, empty, stale, and error states.

Exit gate:

- 1,000-student and 25,000-result fixtures remain usable;
- all counts reconcile to fixture expectations;
- instructor terminology is accepted; and
- keyboard and iPad checks pass.

### Phase 3 — UH OAuth and workbook-copy acceptance

Deliver:

- work-owned OAuth configuration;
- signed-in Sheets reads;
- viewer and editor acceptance accounts;
- workbook-copy test plan;
- token expiry handling; and
- deployment to `/admin-v2/` without linking it from the live instructor workflow.

Exit gate:

- unauthorized accounts receive no workbook data;
- authorized accounts can refresh successfully;
- no token persists after sign-out or reload; and
- the live student page behaves exactly as before.

### Phase 4 — Read-only instructor launch

Deliver:

- final instructor URL;
- concise first-use instructions;
- workbook permission checklist;
- known-data-warning baseline; and
- rollback link to the direct Sheet.

Exit gate:

- Dalen approves the dashboard against real read-only data;
- no Apps Script deployment was required; and
- the dashboard is useful before any write controls exist.

### Phase 5 — Controlled writes

Implement in this order:

1. release open/close/window;
2. single-student single-assessment cycle reset;
3. single-student all-assessment cycle reset; and
4. append-only roster import.

Each operation is a separate reviewed change with tests and workbook-copy evidence.

Exit gate for each operation:

- exact before/after preview;
- editor permission required;
- smallest possible batch request;
- post-write verification;
- no automatic retry;
- no legacy history deletion; and
- no live use until Dalen approves that operation.

### Phase 6 — Retire failed instructor paths

Only after the new portal is accepted:

- mark `admin.html` as legacy or redirect it to `/admin-v2/`;
- remove dashboard links to the small Apps Script dialog where safe;
- retain the student `doPost` actions;
- do not edit or redeploy `Code.gs` solely to remove unused `dash_*` handlers during test week; and
- update README and SETUP to make the new instructor route authoritative.

This phase may require an Apps Script change if the old Sheet menu is altered. That is optional cleanup, not a prerequisite for V2.

## 19. Acceptance criteria

### Cost and ownership

- Dalen pays $0 personally.
- No personal machine serves public traffic.
- No paid hosting, database, or license is required.
- OAuth and workbook ownership remain under work/UH control.

### Student safety

- The live student URL and behavior remain unchanged.
- No student credential rotation occurs during test week.
- Student responses contain no scores or correct answers.
- No second student quiz is created in another repository or lab.

### Instructor product

- The portal opens in a full browser tab.
- Hundreds of accounts can be searched, filtered, and paginated.
- Releases, attempts, results, best scores, and missing tests are understandable.
- Data anomalies are visible without blocking valid rows.
- Routine dashboard UI changes deploy through git only.

### Security

- Workbook data is fetched only after Google authorization.
- Google workbook permissions control access.
- Access tokens remain memory-only.
- No secret exists in the static application.
- Public build assets contain no workbook records, hashes, answers, or keys.
- Instructor writes fail for accounts lacking editor permission.

### Data behavior

- Blank student rows are ignored.
- Legacy Results row 1 is not discarded as a header.
- `L1`–`L6` map consistently to one canonical TestId each.
- Complete means every expected question is answered.
- Best score considers complete results only.
- Reset increments cycle and preserves history.
- `UNSET` retains current legacy-open meaning.
- The application never runs `setup()` against the live workbook.

### Operations

- A dashboard-only change requires no Apps Script editor or deployment.
- The deployed Pages artifact identifies its git commit.
- Read failures preserve the last good view.
- Writes display and verify the exact resulting cells.
- The direct Google Sheet remains the operational fallback.

## 20. Known limitations and escalation triggers

This architecture deliberately accepts:

- Google Sheets as a nontransactional runtime;
- workbook-level permissions instead of server-side application roles;
- Google API quotas and browser network dependence;
- client-side report computation;
- limited concurrency protection for instructor writes;
- convenience audit rows that are not tamper-proof; and
- Apps Script drift remaining on the student backend.

Escalate to an employer-funded backend only when evidence shows one of these:

- concurrent writes create real lost updates;
- Sheet/API latency prevents normal instruction;
- audit requirements exceed Google revision history;
- roles must be narrower than workbook sharing permissions;
- secrets or third-party integrations require a server;
- result volume makes browser reporting unusable after measured optimization; or
- the student Apps Script runtime itself becomes the demonstrated failure point.

Do not preemptively solve these with personal infrastructure.

## 21. Grok Build execution rules

Grok Build may implement after ratifying the exact OAuth and Pages configuration. It must:

- work on a feature branch;
- preserve unrelated and uncommitted user files;
- never read or require Dbrain `.env`;
- never write the live workbook during development;
- use sanitized fixtures;
- make no paid account or billing change;
- make no production OAuth, Pages, or workbook permission change without Dalen's approval;
- keep each mutation type in a separate reviewed unit;
- provide test evidence with each phase;
- keep `index.html` and the current student Web App operational; and
- stop if UH requires billing, a client secret in the browser, or broader data scope than this document permits.

Grok's initial execution report must include:

1. current Pages deployment method;
2. proposed `admin-v2` file structure;
3. exact Google APIs and OAuth scopes, including the read-only launch and later write-scope upgrade;
4. confirmation that no billing account is required;
5. the workbook ranges to be read;
6. the fixtures representing each observed malformed shape;
7. the checks that prevent password hashes and answer keys from entering UI models;
8. the plan for preserving the student root URL; and
9. the first read-only milestone.

Do not reopen paid hosting as an implementation choice. It is outside the approved constraints.

## 22. Reference links

- Google Identity Services browser authorization: <https://developers.google.com/identity/oauth2/web/guides/use-token-model>
- Google Sheets API overview: <https://developers.google.com/workspace/sheets/api/guides/concepts>
- Google Sheets values batch read: <https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/batchGet>
- Google Sheets batch update: <https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/batchUpdate>
- Google Drive file capabilities: <https://developers.google.com/workspace/drive/api/reference/rest/v3/files>
- GitHub Pages: <https://docs.github.com/pages>

## 23. Definition of done

This version is complete when an instructor can open a full-window UH-authorized dashboard, understand the Hōkūlani roster and assessment state, find missing and completed tests, inspect operational data problems, and perform only the approved administrative actions without:

- paying for hosting;
- exposing a personal Mac;
- opening an Apps Script dashboard;
- copying source into Apps Script;
- creating a new Apps Script deployment version for dashboard changes;
- publishing workbook data; or
- interrupting the live student quiz.

Google Sheets remains the source of truth until the employer funds and approves a different runtime.
