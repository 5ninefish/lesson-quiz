# Pickup — connected science lessons — 2026-10-28 1706 HST

Read this file first in a new Grok session. The live portal is `/Users/dalen/Public/clients/lesson-quiz` (`github.com/5ninefish/lesson-quiz`). Dbrain cwd is `/Users/dalen/Dbrain`. Do not treat the local 8765 preview as the portal.

The existing portal controls programs, enrollment, and tests. The teaching lesson runs inside it and saves through the shared Apps Script backend. The instructor dashboard was not replaced.

## Live

- Student: `https://5ninefish.github.io/lesson-quiz/`
- Instructor: `https://5ninefish.github.io/lesson-quiz/admin-v2/?v=93b54b3`
- Instructor bundle: `admin-v2/assets/index-DuP6YAiC.js`
- Web App: `https://script.google.com/macros/s/AKfycbz3Acc6aICeaolVb1KaFiVG4HSMH83NkRWv-2YIcvrHdVAT8-E39uShWuJ25dqB37V9/exec`
- Deployment ID: `AKfycbz3Acc6aICeaolVb1KaFiVG4HSMH83NkRWv-2YIcvrHdVAT8-E39uShWuJ25dqB37V9`
- Script ID: `1Pdbx3MsjPp08-5ARNN-Q8n9GueijIhDqu3pNKmHep96M_muCZ4shxxAC`
- Workbook: Post Test Master `1wFjzB6PgjhZjHWBcgLLVOa1TtBvaEDqoV8PGFYoX3EI`
- Apps Script version **18**, 2026-10-28 9:45 AM HST, description "keep lesson artifacts". GET returns `contract: dashboard-t9` and `teaching: v1`. Same deployment ID and `/exec`. `Dashboard.html` was not replaced.
- GitHub `main` at this pickup is the commit that adds this file. The teaching code is `93b54b3`. Recovery text is in `DASHBOARD_CHECKLIST.md`.

Recovery: Manage deployments, edit this same deployment, choose version 16 or version 15. Do not choose version 17. A resume on version 17 can replace a finished topic's artifact. Version 13 is the pre-bridge service rollback and does not delete workbook rows. Do not create or archive a deployment. Do not paste commit `f16a56d` over the Apps Script project.

## What passed

`preview` finished all five lessons.

| Program | Lesson | Student record |
|---|---|---|
| `teach-cs` | Computer Science | Lesson completed. PRE and POST recorded (3/5 and 3/5). Support column blank. |
| `teach-field` | Health, Astronomy, Soil | Lesson completed. One PRE and one POST each. Wrap left as Needs support. |
| `teach-field` | Sustainability | Lesson completed. Assessment missing. Wrap left as Needs support. Catalog stays UNLINKED. |

`teach-field` Attempts has exactly six submitted sits: Health, Astronomy, and Soil, one PRE and one POST each. No Sustainability attempt. Checks and "Continue with support" did not add Attempts rows.

`walkada` is Not started on the four field lessons. `walkbee` is Not started on Computer Science. View work on the Lessons screen opens the saved topic text.

Each field lesson was left after the first topic and resumed to "Saved." before the rest were finished. Those rows now read Lesson completed. A partial lesson on that same screen is "In progress".

`lessons/runner.js` at `93b54b3` selects the open lesson. Before that, a program with several lessons showed the first lesson's checkmarks inside the others.

## Programs left as they were

`hokulani`, `walk-a`, `walk-b`, and `preview` have no teaching lessons enabled. `preview` the program still has its original six SINGLE tests, including `SCI-CORAL`. Do not assign Sustainability to `SCI-CORAL`. `SCI-CORAL` stays the 3D printing bank.

Only SCI-SOIL, SCI-CORAL, SCI-CS, SCI-ASTRO, SCI-HEALTH, and SCI-DM have banks. The 17 non-science ids stay unloaded.

## Board

Project `61990b1f-2064-440f-a77d-b684823bffd4` stays in progress. Do not mark it done.

Open tasks, still open:

- `89531c0b` — practice on the live Post Test Master from admin-v2. Do not run `setup()`. The sentence in that task that says lessons stay paused is stale.
- `f1dab0d6` — add the 17 non-science post-tests only after their banks are chosen.

Hawaii Lessons `a967d900-8c49-4906-8bd8-75e2e2aebbed` was not changed in the portal session.

## Do not

Do not run `setup()`. Do not hash passwords. Do not print student passwords, answer keys, or which quiz choice is correct. Login is Username. Do not write `/Users/peakforge/`. Do not commit `.claude/` or `.env`. Do not amend. Browser work uses PeakForge Chrome on `127.0.0.1:9222`. Leave Interactive Brokers, Drive, the authuser 0 confirmidentifier tab, and `127.0.0.1:8765` alone. Use the UH Google account `dkahiapo@hawaii.edu` for the instructor page.

Passwords stay on the Students sheet. Do not copy them into notes, commits, or chat.
