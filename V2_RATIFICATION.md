# V2 ratification — Grok Build, 2026-09-16

Status: **RATIFIED with substitutions** (zero-cost sheet-backed instructor portal).  
Spec: `V2_BUILD.md` (revision: zero-cost, not the earlier Postgres draft).

Dalen is not expected to paste `Code.gs`. Live student quiz stays up. No InterServer / Fly / PF public app / Postgres in this version.

## 1. Accepted architecture

- Instructor app = static TypeScript on existing GitHub Pages (`/lesson-quiz/admin-v2/`).
- Student app = existing `index.html` + current Apps Script Web App. Unchanged.
- Runtime SoT = the Hōkūlani Google Sheet. This version does **not** add a server.
- Instructor identity = Google Identity Services token model + workbook ACL (editors write, viewers read).
- Deploy = git push. Apps Script frozen except a separately approved student-production fix.
- One workbook / one dashboard config per program. Ka Pilina is a copy, not a router.
- Students never see scores or keys. Hashes and `Correct` never enter UI models or public assets.
- Read-only first. Writes are Phase 5 and need a workbook **copy** plus Dalen’s OK.
- `$0` personal spend. No PF Mac on public traffic.

This **supersedes** Dbrain kickoff `61990b1f` Postgres/PF/Fly/InterServer as the *current ship*. That board row stays; funded backend is the §20 escalation, not tonight.

## 2. Substitutions (operational)

| Spec | Substitution | Why |
|---|---|---|
| Switch Pages to GitHub Actions now | Keep Pages `main` / root (legacy). Commit built `admin-v2/`. CI tests + build only. | Changing Pages source is a one-time student-URL risk; Dalen must approve it. Git push still publishes the new folder. |
| UH OAuth client in Phase 0 | Phase 1 uses synthetic fixtures + a Demo button. GIS wiring is stubbed until Dalen creates a UH Web client (origin `https://5ninefish.github.io`). | Cannot mint a UH Cloud client from this session. |
| `spreadsheetId` in `config.ts` | Keep it. | ID is not workbook access. The failed hole was `admin.html` + Anyone `doPost`. Sheets API still requires a Google account that can open the book. Rows/hashes still never in Pages. |
| “No identifying data in scope” | Treat usernames as instructor-only; workbook stays private. | Classification sentence is too strong if logins are emails. Product rules unchanged. |

## 3. Not verified from repo/workbook this session

- UH can issue a GIS Web client with Sheets scopes and **no billing**.
- Live `Results` tab still matches the 2026-09-15 inspection (headerless row 1). Parser handles both header and headerless.
- Exact OAuth client ID string.

## 4. Hosting and database

- Host: GitHub Pages (already paid-as-free on this public repo).
- Database: none. Google Sheet.
- Not used: InterServer, Fly, PF public URL, Cloudflare Workers as the app, Postgres.

## 5. Student authentication

Unchanged: email + roster password, SHA-256 in Students col B, Apps Script. No rotation this version.

## 6. Production URL and owner

- Student (live): https://5ninefish.github.io/lesson-quiz/  (owner: `5ninefish/lesson-quiz`, Pages `main` `/`)
- Instructor (this version): https://5ninefish.github.io/lesson-quiz/admin-v2/ after merge to `main`
- Workbook: existing Hōkūlani Shared Drive book (not mutated by this work)

## 7. Execution order

1. Phase 1 — parsers, fixtures, Data Health, read-only UI against demo data, unit tests, CI. **This session.**
2. Phase 2 polish if Phase 1 is green.
3. Phase 3 — Dalen: UH OAuth client + workbook copy. Then live read-only.
4. Phase 4 — instructor launch.
5. Phase 5 — writes, one mutation type at a time, never on the live book first.

## Phase 0 checks

- Pages method: `build_type=legacy`, `source.branch=main`, `source.path=/`, url `https://5ninefish.github.io/lesson-quiz/`.
- No live workbook writes in development.
- `index.html` and Apps Script exec URL not changed by this work.
- Billing: none required for Pages + GIS (client ID is not a secret; no client secret in the browser).
